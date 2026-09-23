package observability

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheckStorageWritability_Success(t *testing.T) {
	tempDir := t.TempDir()
	if err := CheckStorageWritability(tempDir); err != nil {
		t.Fatalf("expected writable storage to pass, got: %v", err)
	}

	for _, sub := range []string{"before", "detail", "after"} {
		info, err := os.Stat(filepath.Join(tempDir, sub))
		if err != nil {
			t.Fatalf("expected subdir %s to exist: %v", sub, err)
		}
		if !info.IsDir() {
			t.Fatalf("expected %s to be directory", sub)
		}
	}
}

func TestCheckStorageWritability_FailureOnNonDirectory(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "storage_file")
	if err := os.WriteFile(filePath, []byte("not a directory"), 0600); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	if err := CheckStorageWritability(filePath); err == nil {
		t.Fatalf("expected storage writability check to fail on file path, got nil")
	}
}
