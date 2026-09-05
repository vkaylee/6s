package auth

import (
	"errors"
	"testing"
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
			got := MapRoleFromGroups(tc.groups, adminDN, safetyDN, leaderDN)
			if got != tc.expected {
				t.Errorf("expected %s, got %s", tc.expected, got)
			}
		})
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
