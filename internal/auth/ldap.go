package auth

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/go-ldap/ldap/v3"
)

// ErrLDAPInvalidCredentials indicates wrong username or password in LDAP bind.
var ErrLDAPInvalidCredentials = errors.New("ldap invalid credentials")

// ErrLDAPUserNotFound indicates the user was not found by filter in LDAP search.
var ErrLDAPUserNotFound = errors.New("ldap user not found")

// ErrLDAPUnreachable indicates LDAP server connection, DNS, or TLS handshake failure.
var ErrLDAPUnreachable = errors.New("ldap server unreachable")

// LDAPClient interface defines methods for connection, service bind, and search checks.
type LDAPClient interface {
	Authenticate(username, password string) (*LDAPUser, error)
	TestConnection() error
	TestSearchPermission() error
}

// LDAPConfig holds parameters for Active Directory / LDAP connection.
type LDAPConfig struct {
	Server        string
	Port          int
	UseTLS        bool
	SkipTLSVerify bool
	BaseDN        string
	BindDN        string
	BindPassword  string
	UserFilter    string
	GroupAdminDN  string
	GroupSafetyDN string
	GroupLeaderDN string
}

// LDAPUser represents user attributes returned from Active Directory.
type LDAPUser struct {
	Username    string
	DN          string
	FullName    string
	Email       string
	Groups      []string
	MatchedRole string
}

// LiveLDAPClient connects to an enterprise Active Directory / LDAP domain controller.
type LiveLDAPClient struct {
	cfg LDAPConfig
}

// NewLiveLDAPClient instantiates LiveLDAPClient with given configuration.
func NewLiveLDAPClient(cfg LDAPConfig) *LiveLDAPClient {
	return &LiveLDAPClient{cfg: cfg}
}

func (c *LiveLDAPClient) dial() (*ldap.Conn, error) {
	addr := net.JoinHostPort(c.cfg.Server, strconv.Itoa(c.cfg.Port))
	tlsConfig := &tls.Config{
		InsecureSkipVerify: c.cfg.SkipTLSVerify, //nolint:gosec
		ServerName:         c.cfg.Server,
	}

	dialer := &net.Dialer{Timeout: 5 * time.Second}

	if c.cfg.UseTLS && c.cfg.Port == 636 {
		conn, err := ldap.DialURL("ldaps://"+addr, ldap.DialWithDialer(dialer), ldap.DialWithTLSConfig(tlsConfig))
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrLDAPUnreachable, err)
		}
		return conn, nil
	}

	conn, err := ldap.DialURL("ldap://"+addr, ldap.DialWithDialer(dialer))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrLDAPUnreachable, err)
	}

	if c.cfg.UseTLS {
		if err := conn.StartTLS(tlsConfig); err != nil {
			if closeErr := conn.Close(); closeErr != nil {
				log.Printf("ldap: error closing connection on StartTLS fail: %v", closeErr)
			}
			return nil, fmt.Errorf("%w: StartTLS failed: %v", ErrLDAPUnreachable, err)
		}
	}

	return conn, nil
}

// TestConnection checks TCP connectivity and performs service bind authentication.
func (c *LiveLDAPClient) TestConnection() error {
	conn, err := c.dial()
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := conn.Close(); closeErr != nil {
			log.Printf("ldap: error closing connection: %v", closeErr)
		}
	}()

	if c.cfg.BindDN != "" {
		if err := conn.Bind(c.cfg.BindDN, c.cfg.BindPassword); err != nil {
			if ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials) {
				return fmt.Errorf("bind authentication failed: %w", ErrLDAPInvalidCredentials)
			}
			return fmt.Errorf("bind failed: %w", err)
		}
	}

	return nil
}

// TestSearchPermission verifies service bind can search user entries under BaseDN.
func (c *LiveLDAPClient) TestSearchPermission() error {
	conn, err := c.dial()
	if err != nil {
		return err
	}
	defer conn.Close()
	if c.cfg.BindDN != "" {
		if err := conn.Bind(c.cfg.BindDN, c.cfg.BindPassword); err != nil {
			if ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials) {
				return fmt.Errorf("bind authentication failed: %w", ErrLDAPInvalidCredentials)
			}
			return fmt.Errorf("bind failed: %w", err)
		}
	}
	sr, err := conn.Search(ldap.NewSearchRequest(
		c.cfg.BaseDN, ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 1, 10, false,
		"(&(objectCategory=person)(objectClass=user))",
		[]string{"dn"}, nil,
	))
	return validateSearchResult(c.cfg.BaseDN, sr, err)
}

func validateSearchResult(baseDN string, sr *ldap.SearchResult, err error) error {
	if err != nil && !ldap.IsErrorWithCode(err, ldap.LDAPResultSizeLimitExceeded) {
		return fmt.Errorf("search permission denied: %w", err)
	}
	if sr == nil || len(sr.Entries) == 0 {
		if err != nil {
			return fmt.Errorf("search permission denied: %w", err)
		}
		return fmt.Errorf("no user entries found under BaseDN %s", baseDN)
	}
	return nil
}

func normalizeADUsername(username string) string {
	username = strings.TrimSpace(username)
	if i := strings.LastIndex(username, `\`); i >= 0 && i+1 < len(username) {
		return username[i+1:]
	}
	return username
}

// Authenticate performs service bind, user search, and user credentials verification.
func (c *LiveLDAPClient) Authenticate(username, password string) (*LDAPUser, error) {
	if password == "" {
		return nil, ErrLDAPInvalidCredentials
	}

	conn, err := c.dial()
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := conn.Close(); closeErr != nil {
			log.Printf("ldap: error closing connection: %v", closeErr)
		}
	}()

	// 1. Service bind
	if c.cfg.BindDN != "" {
		if bindErr := conn.Bind(c.cfg.BindDN, c.cfg.BindPassword); bindErr != nil {
			return nil, fmt.Errorf("%w: service bind failed: %v", ErrLDAPUnreachable, bindErr)
		}
	}

	// 2. Search user
	filter := c.cfg.UserFilter
	if filter == "" {
		filter = "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))"
	}
	username = normalizeADUsername(username)
	escapedUser := ldap.EscapeFilter(username)
	filterStr := fmt.Sprintf(filter, escapedUser, escapedUser)

	searchReq := ldap.NewSearchRequest(
		c.cfg.BaseDN,
		ldap.ScopeWholeSubtree, ldap.NeverDerefAliases, 1, 10, false,
		filterStr,
		[]string{"dn", "displayName", "cn", "mail", "memberOf"},
		nil,
	)

	sr, err := conn.Search(searchReq)
	if err != nil {
		return nil, fmt.Errorf("%w: search failed: %v", ErrLDAPUnreachable, err)
	}

	if len(sr.Entries) == 0 {
		return nil, ErrLDAPUserNotFound
	}

	entry := sr.Entries[0]
	userDN := entry.DN

	// 3. User bind auth (Check user password)
	if err := conn.Bind(userDN, password); err != nil {
		if ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials) {
			return nil, ErrLDAPInvalidCredentials
		}
		return nil, fmt.Errorf("%w: user bind error: %v", ErrLDAPUnreachable, err)
	}

	// 4. Map user attributes and groups
	fullName := entry.GetAttributeValue("displayName")
	if fullName == "" {
		fullName = entry.GetAttributeValue("cn")
	}
	if fullName == "" {
		fullName = username
	}
	email := entry.GetAttributeValue("mail")
	groups := entry.GetAttributeValues("memberOf")

	role := MapRoleFromGroups(groups, c.cfg.GroupAdminDN, c.cfg.GroupSafetyDN, c.cfg.GroupLeaderDN)

	return &LDAPUser{
		Username:    username,
		DN:          userDN,
		FullName:    fullName,
		Email:       email,
		Groups:      groups,
		MatchedRole: role,
	}, nil
}

// MapRoleFromGroups resolves user role by matching group DNs.
func MapRoleFromGroups(userGroups []string, adminDN, safetyDN, leaderDN string) string {
	for _, g := range userGroups {
		if adminDN != "" && strings.EqualFold(strings.TrimSpace(g), strings.TrimSpace(adminDN)) {
			return RoleAdmin.String()
		}
	}
	for _, g := range userGroups {
		if safetyDN != "" && strings.EqualFold(strings.TrimSpace(g), strings.TrimSpace(safetyDN)) {
			return RoleSafetyOfficer.String()
		}
	}
	for _, g := range userGroups {
		if leaderDN != "" && strings.EqualFold(strings.TrimSpace(g), strings.TrimSpace(leaderDN)) {
			return RoleLineLeader.String()
		}
	}
	return RoleUser.String()
}
