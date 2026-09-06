package masterdata

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
func (m *mockMDStore) ListAllLocations(_ context.Context) ([]db.Location, error) {
	return m.locations, nil
}

func (m *mockMDStore) UpdateLocationActiveStatus(_ context.Context, arg db.UpdateLocationActiveStatusParams) (db.Location, error) {
	for i, l := range m.locations {
		if l.Code == arg.Code {
			m.locations[i].IsActive = arg.IsActive
			return m.locations[i], nil
		}
	}
	return db.Location{}, context.DeadlineExceeded
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

func (m *mockMDStore) UpdateLocation(_ context.Context, arg db.UpdateLocationParams) (db.Location, error) {
	for i, l := range m.locations {
		if l.Code == arg.Code {
			m.locations[i].NameVi = arg.NameVi
			m.locations[i].NameZh = arg.NameZh
			m.locations[i].NameEn = arg.NameEn
			m.locations[i].QrCode = arg.QrCode
			return m.locations[i], nil
		}
	}
	return db.Location{}, context.DeadlineExceeded
}

func (m *mockMDStore) ListTags(_ context.Context) ([]db.Tag, error) {
	var active []db.Tag
	for _, t := range m.tags {
		if t.IsActive {
			active = append(active, t)
		}
	}
	return active, nil
}

func (m *mockMDStore) ListAllTags(_ context.Context) ([]db.Tag, error) {
	return m.tags, nil
}

func (m *mockMDStore) UpdateTagActiveStatus(_ context.Context, arg db.UpdateTagActiveStatusParams) (db.Tag, error) {
	for i, t := range m.tags {
		if t.Code == arg.Code {
			m.tags[i].IsActive = arg.IsActive
			return m.tags[i], nil
		}
	}
	return db.Tag{}, context.DeadlineExceeded
}
func (m *mockMDStore) SetAllTagsActiveStatus(_ context.Context, isActive bool) error {
	for i := range m.tags {
		m.tags[i].IsActive = isActive
	}
	return nil
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
		IsActive: true,
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
	// 2b. List All Locations (Admin)
	reqListAll := httptest.NewRequest("GET", "/api/locations/all", nil)
	rrListAll := httptest.NewRecorder()
	handler.ListAllLocations(rrListAll, reqListAll)
	if rrListAll.Code != http.StatusOK {
		t.Fatalf("expected 200 for list all locations, got %d", rrListAll.Code)
	}

	// 2c. Update Location Status (Deactivate)
	statusReq := UpdateLocationStatusRequest{IsActive: false}
	bodyStatus, _ := json.Marshal(statusReq)
	reqStatus := httptest.NewRequest("PATCH", "/api/locations/LINE_A1/status?code=LINE_A1", bytes.NewReader(bodyStatus))
	rrStatus := httptest.NewRecorder()
	handler.UpdateLocationStatus(rrStatus, reqStatus)
	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 for update location status, got %d, body: %s", rrStatus.Code, rrStatus.Body.String())
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

	// 4b. List All Tags (Admin)
	reqAllTags := httptest.NewRequest("GET", "/api/tags/all", nil)
	rrAllTags := httptest.NewRecorder()
	handler.ListAllTags(rrAllTags, reqAllTags)
	if rrAllTags.Code != http.StatusOK {
		t.Fatalf("expected 200 for list all tags, got %d", rrAllTags.Code)
	}

	// 4c. Update Tag Active Status
	tagStatusReq := UpdateTagStatusRequest{IsActive: false}
	bodyTagStatus, _ := json.Marshal(tagStatusReq)
	reqTagStatus := httptest.NewRequest("PATCH", "/api/tags/oil_leak/status?code=oil_leak", bytes.NewReader(bodyTagStatus))
	rrTagStatus := httptest.NewRecorder()
	handler.UpdateTagStatus(rrTagStatus, reqTagStatus)
	if rrTagStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 for update tag status, got %d", rrTagStatus.Code)
	}
	var tagResp struct {
		Data TagResponse `json:"data"`
	}
	_ = json.NewDecoder(rrTagStatus.Body).Decode(&tagResp)
	if tagResp.Data.IsActive != false {
		t.Errorf("expected tag is_active=false, got true")
	}

	// 4d. Verify ListTags now returns 0 active tags
	reqTagsAfter := httptest.NewRequest("GET", "/api/tags", nil)
	rrTagsAfter := httptest.NewRecorder()
	handler.ListTags(rrTagsAfter, reqTagsAfter)
	if rrTagsAfter.Code != http.StatusOK {
		t.Fatalf("expected 200 for list tags after deactivation, got %d", rrTagsAfter.Code)
	}
	var activeResp struct {
		Data []TagResponse `json:"data"`
	}
	_ = json.NewDecoder(rrTagsAfter.Body).Decode(&activeResp)
	if len(activeResp.Data) != 0 {
		t.Errorf("expected 0 active tags, got %d", len(activeResp.Data))
	}
	// 4c. Batch Update Tags Status (Enable All)
	allTrue := true
	batchReq := BatchUpdateTagsStatusRequest{All: &allTrue, IsActive: true}
	batchBody, _ := json.Marshal(batchReq)
	reqBatch := httptest.NewRequest("POST", "/api/tags/batch-status", bytes.NewReader(batchBody))
	rrBatch := httptest.NewRecorder()
	handler.BatchUpdateTagsStatus(rrBatch, reqBatch)
	if rrBatch.Code != http.StatusOK {
		t.Fatalf("expected 200 for batch update tags, got %d, body: %s", rrBatch.Code, rrBatch.Body.String())
	}

	// Verify all tags active again
	reqTagsAllActive := httptest.NewRequest("GET", "/api/tags", nil)
	rrTagsAllActive := httptest.NewRecorder()
	handler.ListTags(rrTagsAllActive, reqTagsAllActive)
	var reloadedResp struct {
		Data []TagResponse `json:"data"`
	}
	_ = json.NewDecoder(rrTagsAllActive.Body).Decode(&reloadedResp)
	if len(reloadedResp.Data) != 1 {
		t.Errorf("expected 1 active tag after batch enable, got %d", len(reloadedResp.Data))
	}

	// 5. Create Location Missing Fields (Validation error)
	badReq := CreateLocationRequest{Code: ""}
	badBody, _ := json.Marshal(badReq)
	reqBad := httptest.NewRequest("POST", "/api/locations", bytes.NewReader(badBody))
	rrBad := httptest.NewRecorder()
	handler.CreateLocation(rrBad, reqBad)
	if rrBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on missing location fields, got %d", rrBad.Code)
	}

	// 6. Update Location Status Missing Code
	reqMissingCode := httptest.NewRequest("PATCH", "/api/locations//status", bytes.NewReader(bodyStatus))
	rrMissingCode := httptest.NewRecorder()
	handler.UpdateLocationStatus(rrMissingCode, reqMissingCode)
	if rrMissingCode.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on missing location code, got %d", rrMissingCode.Code)
	}

	// 7. Update Location Details (Success)
	updateLocReq := UpdateLocationRequest{
		NameVi: "Khu vực A (Đã sửa)",
		NameZh: "区域A (已修改)",
		NameEn: "Area A (Updated)",
		QRCode: "LOC:A_NEW",
	}
	updateLocBody, _ := json.Marshal(updateLocReq)
	reqUpdateLoc := httptest.NewRequest("PUT", "/api/locations/LINE_A1", bytes.NewReader(updateLocBody))
	reqUpdateLoc.SetPathValue("code", "LINE_A1")
	rrUpdateLoc := httptest.NewRecorder()
	handler.UpdateLocation(rrUpdateLoc, reqUpdateLoc)
	if rrUpdateLoc.Code != http.StatusOK {
		t.Fatalf("expected 200 on update location, got %d, body: %s", rrUpdateLoc.Code, rrUpdateLoc.Body.String())
	}
	var updatedLocResp struct {
		Data LocationResponse `json:"data"`
	}
	_ = json.NewDecoder(rrUpdateLoc.Body).Decode(&updatedLocResp)
	if updatedLocResp.Data.NameVi != "Khu vực A (Đã sửa)" || updatedLocResp.Data.QRCode != "LOC:A_NEW" {
		t.Errorf("unexpected updated location: %+v", updatedLocResp.Data)
	}

	// 8. Update Location Details (Validation Error - Missing NameVi or QRCode)
	badUpdateReq := UpdateLocationRequest{NameVi: ""}
	badUpdateBody, _ := json.Marshal(badUpdateReq)
	reqBadUpdate := httptest.NewRequest("PUT", "/api/locations/LINE_A1", bytes.NewReader(badUpdateBody))
	reqBadUpdate.SetPathValue("code", "LINE_A1")
	rrBadUpdate := httptest.NewRecorder()
	handler.UpdateLocation(rrBadUpdate, reqBadUpdate)
	if rrBadUpdate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on missing required fields for update location, got %d", rrBadUpdate.Code)
	}
}

type mockMDErrorStore struct{}

func (m *mockMDErrorStore) ListLocations(_ context.Context) ([]db.Location, error) {
	return nil, errors.New("db error")
}
func (m *mockMDErrorStore) ListAllLocations(_ context.Context) ([]db.Location, error) {
	return nil, errors.New("db error")
}
func (m *mockMDErrorStore) UpdateLocationActiveStatus(_ context.Context, _ db.UpdateLocationActiveStatusParams) (db.Location, error) {
	return db.Location{}, errors.New("db error")
}
func (m *mockMDErrorStore) CreateLocation(_ context.Context, _ db.CreateLocationParams) (db.Location, error) {
	return db.Location{}, errors.New("db error")
}
func (m *mockMDErrorStore) UpdateLocation(_ context.Context, _ db.UpdateLocationParams) (db.Location, error) {
	return db.Location{}, errors.New("db error")
}
func (m *mockMDErrorStore) ListTags(_ context.Context) ([]db.Tag, error) {
	return nil, errors.New("db error")
}
func (m *mockMDErrorStore) ListAllTags(_ context.Context) ([]db.Tag, error) {
	return nil, errors.New("db error")
}
func (m *mockMDErrorStore) UpdateTagActiveStatus(_ context.Context, _ db.UpdateTagActiveStatusParams) (db.Tag, error) {
	return db.Tag{}, errors.New("db error")
}
func (m *mockMDErrorStore) SetAllTagsActiveStatus(_ context.Context, _ bool) error {
	return errors.New("db error")
}
func (m *mockMDErrorStore) UpsertTag(_ context.Context, _ db.UpsertTagParams) (db.Tag, error) {
	return db.Tag{}, errors.New("db error")
}

func TestMasterDataHandler_ErrorBranches(t *testing.T) {
	validStore := &mockMDStore{
		tags: []db.Tag{{Code: "T1", IsActive: true}},
	}
	handler := NewHandler(validStore)
	errHandler := NewHandler(&mockMDErrorStore{})

	// Batch update specific codes
	batchReq := BatchUpdateTagsStatusRequest{Codes: []string{"T1"}, IsActive: false}
	body, _ := json.Marshal(batchReq)
	req := httptest.NewRequest("POST", "/api/tags/batch-status", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	handler.BatchUpdateTagsStatus(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for batch specific codes, got %d", rr.Code)
	}

	// Batch update bad JSON
	reqBad := httptest.NewRequest("POST", "/api/tags/batch-status", bytes.NewReader([]byte("{invalid")))
	rrBad := httptest.NewRecorder()
	handler.BatchUpdateTagsStatus(rrBad, reqBad)
	if rrBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in batch status, got %d", rrBad.Code)
	}

	// Batch update error store (all=true)
	allTrue := true
	batchAllReq := BatchUpdateTagsStatusRequest{All: &allTrue, IsActive: true}
	bodyAll, _ := json.Marshal(batchAllReq)
	reqAllErr := httptest.NewRequest("POST", "/api/tags/batch-status", bytes.NewReader(bodyAll))
	rrAllErr := httptest.NewRecorder()
	errHandler.BatchUpdateTagsStatus(rrAllErr, reqAllErr)
	if rrAllErr.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for batch all on error store, got %d", rrAllErr.Code)
	}

	// Batch update error store (codes)
	reqCodesErr := httptest.NewRequest("POST", "/api/tags/batch-status", bytes.NewReader(body))
	rrCodesErr := httptest.NewRecorder()
	errHandler.BatchUpdateTagsStatus(rrCodesErr, reqCodesErr)
	if rrCodesErr.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for batch codes on error store, got %d", rrCodesErr.Code)
	}

	// Upsert tag bad JSON & missing fields
	reqBadTag := httptest.NewRequest("POST", "/api/tags", bytes.NewReader([]byte("{invalid")))
	rrBadTag := httptest.NewRecorder()
	handler.UpsertTag(rrBadTag, reqBadTag)
	if rrBadTag.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in upsert tag, got %d", rrBadTag.Code)
	}

	missingTagReq := UpsertTagRequest{Code: "T2", NameVi: ""}
	bodyMissing, _ := json.Marshal(missingTagReq)
	reqMissingTag := httptest.NewRequest("POST", "/api/tags", bytes.NewReader(bodyMissing))
	rrMissingTag := httptest.NewRecorder()
	handler.UpsertTag(rrMissingTag, reqMissingTag)
	if rrMissingTag.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fields in upsert tag, got %d", rrMissingTag.Code)
	}

	validTagReq := UpsertTagRequest{Code: "T2", NameVi: "Ten", Category: "1S"}
	bodyValidTag, _ := json.Marshal(validTagReq)
	reqErrTag := httptest.NewRequest("POST", "/api/tags", bytes.NewReader(bodyValidTag))
	rrErrTag := httptest.NewRecorder()
	errHandler.UpsertTag(rrErrTag, reqErrTag)
	if rrErrTag.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on upsert tag error store, got %d", rrErrTag.Code)
	}

	// Update tag status bad JSON & error store
	reqBadTagStatus := httptest.NewRequest("PATCH", "/api/tags/T1/status?code=T1", bytes.NewReader([]byte("{invalid")))
	rrBadTagStatus := httptest.NewRecorder()
	handler.UpdateTagStatus(rrBadTagStatus, reqBadTagStatus)
	if rrBadTagStatus.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in update tag status, got %d", rrBadTagStatus.Code)
	}

	tagStatusReq := UpdateTagStatusRequest{IsActive: true}
	bodyTagStatus, _ := json.Marshal(tagStatusReq)
	reqErrTagStatus := httptest.NewRequest("PATCH", "/api/tags/T1/status?code=T1", bytes.NewReader(bodyTagStatus))
	rrErrTagStatus := httptest.NewRecorder()
	errHandler.UpdateTagStatus(rrErrTagStatus, reqErrTagStatus)
	if rrErrTagStatus.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for update tag status error store, got %d", rrErrTagStatus.Code)
	}

	// Update location status bad JSON & error store
	reqBadLocStatus := httptest.NewRequest("PATCH", "/api/locations/L1/status?code=L1", bytes.NewReader([]byte("{invalid")))
	rrBadLocStatus := httptest.NewRecorder()
	handler.UpdateLocationStatus(rrBadLocStatus, reqBadLocStatus)
	if rrBadLocStatus.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in update location status, got %d", rrBadLocStatus.Code)
	}

	locStatusReq := UpdateLocationStatusRequest{IsActive: true}
	bodyLocStatus, _ := json.Marshal(locStatusReq)
	reqErrLocStatus := httptest.NewRequest("PATCH", "/api/locations/L1/status?code=L1", bytes.NewReader(bodyLocStatus))
	rrErrLocStatus := httptest.NewRecorder()
	errHandler.UpdateLocationStatus(rrErrLocStatus, reqErrLocStatus)
	if rrErrLocStatus.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for update location status error store, got %d", rrErrLocStatus.Code)
	}

	// Update location bad JSON & error store
	reqBadLocUpdate := httptest.NewRequest("PUT", "/api/locations/L1", bytes.NewReader([]byte("{invalid")))
	reqBadLocUpdate.SetPathValue("code", "L1")
	rrBadLocUpdate := httptest.NewRecorder()
	handler.UpdateLocation(rrBadLocUpdate, reqBadLocUpdate)
	if rrBadLocUpdate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in update location, got %d", rrBadLocUpdate.Code)
	}

	validLocUpdate := UpdateLocationRequest{NameVi: "Loc", QRCode: "QR"}
	bodyLocUpdate, _ := json.Marshal(validLocUpdate)
	reqErrLocUpdate := httptest.NewRequest("PUT", "/api/locations/L1", bytes.NewReader(bodyLocUpdate))
	reqErrLocUpdate.SetPathValue("code", "L1")
	rrErrLocUpdate := httptest.NewRecorder()
	errHandler.UpdateLocation(rrErrLocUpdate, reqErrLocUpdate)
	if rrErrLocUpdate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for update location error store, got %d", rrErrLocUpdate.Code)
	}

	// Create location bad JSON & error store
	reqBadCreate := httptest.NewRequest("POST", "/api/locations", bytes.NewReader([]byte("{invalid")))
	rrBadCreate := httptest.NewRecorder()
	handler.CreateLocation(rrBadCreate, reqBadCreate)
	if rrBadCreate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in create location, got %d", rrBadCreate.Code)
	}

	validCreate := CreateLocationRequest{Code: "L2", NameVi: "Loc2", QRCode: "QR2"}
	bodyCreate, _ := json.Marshal(validCreate)
	reqErrCreate := httptest.NewRequest("POST", "/api/locations", bytes.NewReader(bodyCreate))
	rrErrCreate := httptest.NewRecorder()
	errHandler.CreateLocation(rrErrCreate, reqErrCreate)
	if rrErrCreate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for create location error store, got %d", rrErrCreate.Code)
	}

	// List queries on error store
	reqListLoc := httptest.NewRequest("GET", "/api/locations", nil)
	rrListLoc := httptest.NewRecorder()
	errHandler.ListLocations(rrListLoc, reqListLoc)
	if rrListLoc.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for list locations error store, got %d", rrListLoc.Code)
	}

	reqListAllLoc := httptest.NewRequest("GET", "/api/locations/all", nil)
	rrListAllLoc := httptest.NewRecorder()
	errHandler.ListAllLocations(rrListAllLoc, reqListAllLoc)
	if rrListAllLoc.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for list all locations error store, got %d", rrListAllLoc.Code)
	}

	reqListTags := httptest.NewRequest("GET", "/api/tags", nil)
	rrListTags := httptest.NewRecorder()
	errHandler.ListTags(rrListTags, reqListTags)
	if rrListTags.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for list tags error store, got %d", rrListTags.Code)
	}

	reqListAllTags := httptest.NewRequest("GET", "/api/tags/all", nil)
	rrListAllTags := httptest.NewRecorder()
	errHandler.ListAllTags(rrListAllTags, reqListAllTags)
	if rrListAllTags.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for list all tags error store, got %d", rrListAllTags.Code)
	}
}
