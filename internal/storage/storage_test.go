package storage

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func createTestFileHeader(t *testing.T, fieldName, filename string, content []byte) *multipart.FileHeader {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("CreateFormFile error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("Write part error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close writer error: %v", err)
	}

	req := httptest.NewRequest("POST", "/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		t.Fatalf("ParseMultipartForm error: %v", err)
	}

	return req.MultipartForm.File[fieldName][0]
}

func TestManager_SaveAndServePhotos(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "6s_test_storage_*")
	if err != nil {
		t.Fatalf("MkdirTemp error: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("NewManager error: %v", err)
	}

	clientUUID := "c0a80101-0000-4000-8000-000000000001"

	// 1. Valid JPEG
	jpegBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x01}, 100)...)
	fh := createTestFileHeader(t, "photo_before", "test.jpg", jpegBytes)

	savedName, err := mgr.SaveBeforePhoto(fh, clientUUID)
	if err != nil {
		t.Fatalf("SaveBeforePhoto failed: %v", err)
	}
	if savedName != clientUUID+"_wide.jpg" {
		t.Errorf("expected %s_wide.jpg, got %s", clientUUID, savedName)
	}

	// 2. Serve static file check headers
	handler := mgr.FileServer()
	req := httptest.NewRequest("GET", "/before/"+savedName, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on serving file, got %d", rr.Code)
	}
	cc := rr.Header().Get("Cache-Control")
	if cc != "public, max-age=31536000, immutable" {
		t.Errorf("expected Cache-Control immutable header, got %s", cc)
	}

	// 3. Invalid magic bytes (shell script disguised as jpg)
	shellBytes := []byte("#!/bin/sh\necho hack\n")
	fhShell := createTestFileHeader(t, "photo_before", "evil.jpg", shellBytes)
	_, err = mgr.SaveBeforePhoto(fhShell, clientUUID)
	if err != ErrUnsupportedType {
		t.Errorf("expected ErrUnsupportedType for shell script, got %v", err)
	}

	// 4. Invalid UUID
	_, err = mgr.SaveBeforePhoto(fh, "invalid-uuid")
	if err != ErrInvalidUUID {
		t.Errorf("expected ErrInvalidUUID, got %v", err)
	}

	// 5. File too large (> 2MB)
	bigBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 2*1024*1024+10)...)
	fhBig := createTestFileHeader(t, "photo_before", "big.jpg", bigBytes)
	_, err = mgr.SaveBeforePhoto(fhBig, clientUUID)
	if err != ErrFileTooLarge {
		t.Errorf("expected ErrFileTooLarge, got %v", err)
	}
}

func TestManager_SaveAfterPhoto(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "6s_test_after_*")
	if err != nil {
		t.Fatalf("MkdirTemp error: %v", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("NewManager error: %v", err)
	}

	clientUUID := "c0a80101-0000-4000-8000-000000000002"
	pngBytes := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0x02}, 50)...)
	fh := createTestFileHeader(t, "photo_after", "after.png", pngBytes)

	savedName, err := mgr.SaveAfterPhoto(fh, clientUUID)
	if err != nil {
		t.Fatalf("SaveAfterPhoto failed: %v", err)
	}
	if savedName != clientUUID+".png" {
		t.Errorf("expected %s.png, got %s", clientUUID, savedName)
	}

	fullPath := filepath.Join(tempDir, "after", savedName)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Fatalf("expected file to exist at %s", fullPath)
	}
}
