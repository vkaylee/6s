package masterdata

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/db"
)

type mockMDStore struct {
	locations []db.Location
	tags      []db.Tag
}

func (m *mockMDStore) ListLocations(_ context.Context) ([]db.Location, error) {
	return m.locations, nil
}

func (m *mockMDStore) CreateLocation(_ context.Context, arg db.CreateLocationParams) (db.Location, error) {
	loc := db.Location{
		Code:     arg.Code,
		NameVi:   arg.NameVi,
		NameZh:   arg.NameZh,
		NameEn:   arg.NameEn,
		QrCode:   arg.QrCode,
		IsActive: true,
	}
	m.locations = append(m.locations, loc)
	return loc, nil
}

func (m *mockMDStore) ListTags(_ context.Context) ([]db.Tag, error) {
	return m.tags, nil
}

func (m *mockMDStore) UpsertTag(_ context.Context, arg db.UpsertTagParams) (db.Tag, error) {
	t := db.Tag{
		Code:     arg.Code,
		NameVi:   arg.NameVi,
		NameZh:   arg.NameZh,
		NameEn:   arg.NameEn,
		Category: arg.Category,
		UseCount: 1,
		IsPreset: arg.IsPreset,
	}
	m.tags = append(m.tags, t)
	return t, nil
}

func TestMasterDataHandler(t *testing.T) {
	store := &mockMDStore{}
	handler := NewHandler(store)

	// 1. Create Location
	locReq := CreateLocationRequest{
		Code:   "LINE_A1",
		NameVi: "Chuyền May A1",
		NameZh: "缝纫 A1 线",
		NameEn: "Sewing Line A1",
		QRCode: "LOC:LINE_A1",
	}
	body, _ := json.Marshal(locReq)
	req := httptest.NewRequest("POST", "/api/locations", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	handler.CreateLocation(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 for create location, got %d", rr.Code)
	}

	// 2. List Locations
	reqList := httptest.NewRequest("GET", "/api/locations", nil)
	rrList := httptest.NewRecorder()
	handler.ListLocations(rrList, reqList)
	if rrList.Code != http.StatusOK {
		t.Fatalf("expected 200 for list locations, got %d", rrList.Code)
	}

	// 3. Upsert Tag
	tagReq := UpsertTagRequest{
		Code:     "oil_leak",
		NameVi:   "Rò rỉ dầu",
		NameZh:   "漏油",
		NameEn:   "Oil leak",
		Category: "3S",
		IsPreset: true,
	}
	bodyTag, _ := json.Marshal(tagReq)
	reqTag := httptest.NewRequest("POST", "/api/tags", bytes.NewReader(bodyTag))
	rrTag := httptest.NewRecorder()
	handler.UpsertTag(rrTag, reqTag)
	if rrTag.Code != http.StatusOK {
		t.Fatalf("expected 200 for upsert tag, got %d", rrTag.Code)
	}

	// 4. List Tags
	reqTags := httptest.NewRequest("GET", "/api/tags", nil)
	rrTags := httptest.NewRecorder()
	handler.ListTags(rrTags, reqTags)
	if rrTags.Code != http.StatusOK {
		t.Fatalf("expected 200 for list tags, got %d", rrTags.Code)
	}
}
