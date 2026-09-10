package auth

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/go-ldap/ldap/v3"
)

type MockLDAPClient struct {
	UserToReturn *LDAPUser
	ErrToReturn  error
}

func (m *MockLDAPClient) Authenticate(_, _ string) (*LDAPUser, error) {
	if m.ErrToReturn != nil {
		return nil, m.ErrToReturn
	}
	return m.UserToReturn, nil
}

func (m *MockLDAPClient) TestConnection() error {
	return m.ErrToReturn
}

func (m *MockLDAPClient) TestSearchPermission() error {
	return m.ErrToReturn
}

func TestMapRoleFromGroups(t *testing.T) {
	adminDN := "CN=Admins,OU=Groups,DC=factory,DC=lan"
	safetyDN := "CN=Safety,OU=Groups,DC=factory,DC=lan"
	leaderDN := "CN=Leaders,OU=Groups,DC=factory,DC=lan"

	cases := []struct {
		name     string
		groups   []string
		expected string
	}{
		{
			name:     "Admin Group",
			groups:   []string{"CN=Users,OU=Groups,DC=factory,DC=lan", adminDN},
			expected: RoleAdmin.String(),
		},
		{
			name:     "Safety Group",
			groups:   []string{safetyDN},
			expected: RoleSafetyOfficer.String(),
		},
		{
			name:     "Line Leader Group",
			groups:   []string{leaderDN},
			expected: RoleLineLeader.String(),
		},
		{
			name:     "SUPERADMIN group is never mapped",
			groups:   []string{"SUPERADMIN"},
			expected: RoleUser.String(),
		},
		{
			name:     "SUPERADMIN configured as admin group is rejected",
			groups:   []string{"SUPERADMIN"},
			expected: RoleUser.String(),
		},
		{
			name:     "SUPERADMIN input does not override ADMIN mapping",
			groups:   []string{"SUPERADMIN", adminDN},
			expected: RoleAdmin.String(),
		},
		{
			name:     "Safety mapping preserved with SUPERADMIN input",
			groups:   []string{"SUPERADMIN", safetyDN},
			expected: RoleSafetyOfficer.String(),
		},
		{
			name:     "Leader mapping preserved with SUPERADMIN input",
			groups:   []string{"SUPERADMIN", leaderDN},
			expected: RoleLineLeader.String(),
		},
		{
			name:     "Normal User",
			groups:   []string{"CN=Users,OU=Groups,DC=factory,DC=lan"},
			expected: RoleUser.String(),
		},
		{
			name:     "Empty Groups",
			groups:   nil,
			expected: RoleUser.String(),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			adminGroup := adminDN
			if tc.name == "SUPERADMIN configured as admin group is rejected" {
				adminGroup = RoleSuperadmin.String()
			}
			got := MapRoleFromGroups(tc.groups, adminGroup, safetyDN, leaderDN)
			if got != tc.expected {
				t.Errorf("expected %s, got %s", tc.expected, got)
			}
		})
	}
}

func TestLDAPProvisioningRole(t *testing.T) {
	for _, tc := range []struct {
		name, input, expected string
	}{
		{name: "ADMIN preserved", input: RoleAdmin.String(), expected: RoleAdmin.String()},
		{name: "Safety preserved", input: RoleSafetyOfficer.String(), expected: RoleSafetyOfficer.String()},
		{name: "Leader preserved", input: RoleLineLeader.String(), expected: RoleLineLeader.String()},
		{name: "SUPERADMIN downgraded", input: RoleSuperadmin.String(), expected: RoleUser.String()},
		{name: "unknown downgraded", input: "ROOT", expected: RoleUser.String()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ldapProvisioningRole(tc.input); got != tc.expected {
				t.Errorf("expected %s, got %s", tc.expected, got)
			}
		})
	}
}

func TestNormalizeADUsername(t *testing.T) {
	for input, expected := range map[string]string{
		"jdoe":             "jdoe",
		"jdoe@factory.lan": "jdoe@factory.lan",
		`FACTORY\jdoe`:     "jdoe",
		"  jdoe  ":         "jdoe",
	} {
		if got := normalizeADUsername(input); got != expected {
			t.Errorf("normalizeADUsername(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestMockLDAPClient(t *testing.T) {
	mock := &MockLDAPClient{
		UserToReturn: &LDAPUser{
			Username:    "johndoe",
			DN:          "CN=John Doe,OU=Users,DC=factory,DC=lan",
			FullName:    "John Doe",
			Email:       "johndoe@factory.lan",
			MatchedRole: RoleUser.String(),
		},
	}

	user, err := mock.Authenticate("johndoe", "secret")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if user.Username != "johndoe" {
		t.Errorf("expected johndoe, got %s", user.Username)
	}

	// Test error case
	mock.ErrToReturn = ErrLDAPInvalidCredentials
	_, err = mock.Authenticate("johndoe", "wrong")
	if !errors.Is(err, ErrLDAPInvalidCredentials) {
		t.Errorf("expected ErrLDAPInvalidCredentials, got %v", err)
	}
}

func TestLiveLDAPClient_Coverage(t *testing.T) {
	cfgPlain := LDAPConfig{
		Server: "127.0.0.1",
		Port:   1, // Unreachable port
		UseTLS: false,
	}
	clientPlain := NewLiveLDAPClient(cfgPlain)
	if err := clientPlain.TestConnection(); err == nil {
		t.Error("expected dial error for unreachable port, got nil")
	}

	cfgTLS := LDAPConfig{
		Server: "127.0.0.1",
		Port:   636, // LDAPS
		UseTLS: true,
	}
	clientTLS := NewLiveLDAPClient(cfgTLS)
	if err := clientTLS.TestConnection(); err == nil {
		t.Error("expected LDAPS dial error, got nil")
	}

	cfgStartTLS := LDAPConfig{
		Server: "127.0.0.1",
		Port:   1,
		UseTLS: true,
	}
	clientStartTLS := NewLiveLDAPClient(cfgStartTLS)
	if err := clientStartTLS.TestConnection(); err == nil {
		t.Error("expected StartTLS dial error, got nil")
	}

	// Empty password check in Authenticate
	if _, err := clientPlain.Authenticate("user", ""); !errors.Is(err, ErrLDAPInvalidCredentials) {
		t.Errorf("expected ErrLDAPInvalidCredentials for empty password, got %v", err)
	}

	// Dial failure in Authenticate
	if _, err := clientPlain.Authenticate("user", "pass"); err == nil {
		t.Error("expected error for unreachable server in Authenticate, got nil")
	}
}

func TestValidateSearchResult(t *testing.T) {
	entry := &ldap.Entry{DN: "CN=user,DC=example,DC=com"}
	valid := &ldap.SearchResult{Entries: []*ldap.Entry{entry}}
	if err := validateSearchResult("DC=example,DC=com", valid, nil); err != nil {
		t.Fatalf("valid result: %v", err)
	}
	if err := validateSearchResult("DC=example,DC=com", valid, &ldap.Error{ResultCode: ldap.LDAPResultSizeLimitExceeded}); err != nil {
		t.Fatalf("size-limited result: %v", err)
	}
	if err := validateSearchResult("DC=example,DC=com", &ldap.SearchResult{}, nil); err == nil {
		t.Fatal("expected empty result error")
	}
	if err := validateSearchResult("DC=example,DC=com", valid, &ldap.Error{ResultCode: ldap.LDAPResultInsufficientAccessRights}); err == nil {
		t.Fatal("expected access-denied error")
	}
}

func TestValidateLDAPConfigAllowsPrivateAndCustomPorts(t *testing.T) {
	for _, req := range []UpdateADConfigRequest{
		{Server: "10.0.0.12", Port: 1389},
		{Server: "ad.factory.lan", Port: 3269},
		{Server: "[fd00::12]", Port: 636},
	} {
		if err := validateLDAPConfig(req); err != nil {
			t.Fatalf("valid LDAP config rejected: %v", err)
		}
	}
	for _, req := range []UpdateADConfigRequest{
		{Server: "", Port: 389},
		{Server: "ad.factory.lan/path", Port: 389},
		{Server: "ad.factory.lan", Port: 0},
		{Server: "ad.factory.lan", Port: 65536},
	} {
		if err := validateLDAPConfig(req); err == nil {
			t.Fatalf("malformed LDAP config accepted: %+v", req)
		}
	}
}

func TestUpdateADConfigRequestPreservesExplicitFalse(t *testing.T) {
	var req UpdateADConfigRequest
	if err := json.Unmarshal([]byte(`{"use_tls":false,"skip_tls_verify":false}`), &req); err != nil {
		t.Fatal(err)
	}
	if req.UseTLS || req.SkipTLSVerify || !req.useTLSSet || !req.skipTLSSet {
		t.Fatalf("explicit false booleans not preserved: %+v", req)
	}
}
