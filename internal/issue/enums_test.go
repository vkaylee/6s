package issue

import (
	"testing"
)

func TestEnums_Coverage(t *testing.T) {
	// Status
	if StatusOpen.String() != string(StatusOpen) {
		t.Errorf("expected %s, got %s", StatusOpen, StatusOpen.String())
	}

	// Category
	if Category1S.String() != string(Category1S) {
		t.Errorf("expected %s, got %s", Category1S, Category1S.String())
	}
	if !Category1S.IsValid() {
		t.Error("expected Category1S to be valid")
	}
	if Category("INVALID").IsValid() {
		t.Error("expected INVALID category to be invalid")
	}

	// CauseType
	if CauseTypeCondition.String() != "CONDITION" {
		t.Errorf("expected CONDITION, got %s", CauseTypeCondition.String())
	}
	if CauseTypeBehavior.String() != "BEHAVIOR" {
		t.Errorf("expected BEHAVIOR, got %s", CauseTypeBehavior.String())
	}
	if !CauseTypeCondition.IsValid() || !CauseTypeBehavior.IsValid() {
		t.Error("expected CONDITION and BEHAVIOR to be valid")
	}
	if CauseType("UNKNOWN").IsValid() {
		t.Error("expected UNKNOWN cause type to be invalid")
	}

	// NormalizeCauseType
	if NormalizeCauseType("BEHAVIOR", "1S") != "BEHAVIOR" {
		t.Errorf("expected explicit BEHAVIOR preserved")
	}
	if NormalizeCauseType("CONDITION", "5S") != "CONDITION" {
		t.Errorf("expected explicit CONDITION preserved")
	}
	if NormalizeCauseType("", "5S") != "BEHAVIOR" {
		t.Errorf("expected 5S to default to BEHAVIOR")
	}
	if NormalizeCauseType("", "1S") != "CONDITION" {
		t.Errorf("expected 1S to default to CONDITION")
	}
}
