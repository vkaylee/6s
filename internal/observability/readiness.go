package observability

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// CheckStorageWritability verifies that upload directories under baseDir exist
// (or can be created) and support creating, writing, and deleting temporary probe files.
func CheckStorageWritability(baseDir string) error {
	if strings.TrimSpace(baseDir) == "" {
		baseDir = "./data"
	}
	cleanDir := filepath.Clean(baseDir)
	for _, subdir := range []string{"before", "detail", "after"} {
		dir := filepath.Join(cleanDir, subdir)
		if err := os.MkdirAll(dir, 0750); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", subdir, err)
		}
		file, err := os.CreateTemp(dir, ".readiness-*")
		if err != nil {
			return fmt.Errorf("failed to create probe file in %s: %w", subdir, err)
		}
		name := file.Name()
		if _, err := file.Write([]byte("ready")); err != nil {
			_ = file.Close()
			_ = os.Remove(name)
			return fmt.Errorf("failed to write probe file in %s: %w", subdir, err)
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(name)
			return fmt.Errorf("failed to close probe file in %s: %w", subdir, err)
		}
		if err := os.Remove(name); err != nil {
			return fmt.Errorf("failed to remove probe file in %s: %w", subdir, err)
		}
	}
	return nil
}
