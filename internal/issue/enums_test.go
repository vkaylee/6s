package issue

import (
	"testing"
)

func TestEnums_Coverage(t *testing.T) {
	// Status
	if StatusOpen.String() != string(StatusOpen) {
		t.Errorf("expected %s, got %s", StatusOpen, StatusOpen.String())
	}
	for _, s := range []Status{StatusOpen, StatusPendingReview, StatusClosed, StatusInvalid} {
		if !s.IsValid() {
			t.Errorf("expected status %s to be valid", s)
		}
	}
	if Status("UNKNOWN").IsValid() || Status("").IsValid() {
		t.Error("expected invalid status to be rejected")
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

	// CauseStatus
	for _, cs := range []CauseStatus{CauseStatusUnverified, CauseStatusConfirmed, CauseStatusNotApplicable} {
		if !cs.IsValid() || cs.String() != string(cs) {
			t.Errorf("expected cause status %s to be valid", cs)
		}
	}
	if CauseStatus("INVALID").IsValid() || !isValidCauseStatus("CONFIRMED") || isValidCauseStatus("BAD") {
		t.Error("expected invalid cause status to be rejected")
	}

	// VisibilityClass
	for _, vc := range []VisibilityClass{VisibilitySitePublic, VisibilitySafetyRestricted} {
		if !vc.IsValid() || vc.String() != string(vc) {
			t.Errorf("expected visibility class %s to be valid", vc)
		}
	}
	if VisibilityClass("HIDDEN").IsValid() {
		t.Error("expected invalid visibility class to be rejected")
	}

	// LocationSnapshotSource
	for _, ls := range []LocationSnapshotSource{LocationSnapshotClient, LocationSnapshotServer} {
		if !ls.IsValid() || ls.String() != string(ls) {
			t.Errorf("expected snapshot source %s to be valid", ls)
		}
	}
	if LocationSnapshotSource("OTHER").IsValid() {
		t.Error("expected invalid snapshot source to be rejected")
	}

	// ResponsibilityType
	for _, rt := range []ResponsibilityType{ResponsibilityOwner, ResponsibilityBackup, ResponsibilityReviewer} {
		if !rt.IsValid() || rt.String() != string(rt) {
			t.Errorf("expected responsibility %s to be valid", rt)
		}
	}
	if ResponsibilityType("SUPER").IsValid() {
		t.Error("expected invalid responsibility type to be rejected")
	}

	// HistoryAction
	for _, ha := range []HistoryAction{HistoryActionAssign, HistoryActionTransfer, HistoryActionCauseVerify, HistoryActionOther} {
		if !ha.IsValid() || ha.String() != string(ha) {
			t.Errorf("expected history action %s to be valid", ha)
		}
	}
	if HistoryAction("DELETE").IsValid() {
		t.Error("expected invalid history action to be rejected")
	}
}
