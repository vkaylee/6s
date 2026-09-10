// Package storage manages local file storage for uploaded issue photos.
package storage

import (
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// Storage errors.
var (
	ErrFileTooLarge    = errors.New("file size exceeds maximum allowed 2MB")
	ErrUnsupportedType = errors.New("file type not supported; only jpeg and png allowed")
	ErrInvalidUUID     = errors.New("invalid client_uuid")
	ErrEmptyFile       = errors.New("empty file payload")
	ErrPathTraversal   = errors.New("invalid path traversal attempt")
)

// MaxFileSize 2MB limit per SPEC.md Section 6.3.
const MaxFileSize = 2 * 1024 * 1024

// Manager manages local file system storage for uploaded photos.
type Manager struct {
	baseDir string
}

// NewManager initializes directories for uploads.
func NewManager(baseDir string) (*Manager, error) {
	cleanDir := filepath.Clean(baseDir)
	for _, sub := range []string{"before", "detail", "after"} {
		dir := filepath.Join(cleanDir, sub)
		if err := os.MkdirAll(dir, 0750); err != nil {
			return nil, fmt.Errorf("failed to create upload directory %s: %w", dir, err)
		}
	}
	return &Manager{baseDir: cleanDir}, nil
}

// SaveBeforePhoto stores the mandatory initial issue photo.
func (m *Manager) SaveBeforePhoto(fileHeader *multipart.FileHeader, clientUUID string) (string, error) {
	return m.savePhoto(fileHeader, clientUUID, "before", "wide")
}

// SaveDetailPhoto stores the optional close-up photo.
func (m *Manager) SaveDetailPhoto(fileHeader *multipart.FileHeader, clientUUID string) (string, error) {
	if fileHeader == nil {
		return "", nil
	}
	return m.savePhoto(fileHeader, clientUUID, "detail", "detail")
}

// SaveAfterPhoto stores the post-fix photo.
func (m *Manager) SaveAfterPhoto(fileHeader *multipart.FileHeader, clientUUID string) (string, error) {
	return m.savePhoto(fileHeader, clientUUID, "after", "")
}

func (m *Manager) validateAndOpen(fileHeader *multipart.FileHeader, clientUUID string) (multipart.File, uuid.UUID, string, error) {
	if fileHeader == nil {
		return nil, uuid.Nil, "", ErrEmptyFile
	}
	if fileHeader.Size > MaxFileSize {
		return nil, uuid.Nil, "", ErrFileTooLarge
	}

	parsedUUID, err := uuid.Parse(clientUUID)
	if err != nil {
		return nil, uuid.Nil, "", ErrInvalidUUID
	}

	src, err := fileHeader.Open()
	if err != nil {
		return nil, uuid.Nil, "", fmt.Errorf("failed to open upload file: %w", err)
	}

	headerBytes := make([]byte, 512)
	n, readErr := src.Read(headerBytes)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		if cErr := src.Close(); cErr != nil {
			log.Printf("failed to close src: %v", cErr)
		}
		return nil, uuid.Nil, "", fmt.Errorf("failed to read magic bytes: %w", readErr)
	}
	if n < 4 {
		if cErr := src.Close(); cErr != nil {
			log.Printf("failed to close src: %v", cErr)
		}
		return nil, uuid.Nil, "", ErrUnsupportedType
	}

	ext, ok := DetectImageExtension(headerBytes[:n])
	if !ok {
		if cErr := src.Close(); cErr != nil {
			log.Printf("failed to close src: %v", cErr)
		}
		return nil, uuid.Nil, "", ErrUnsupportedType
	}

	if _, seekErr := src.Seek(0, io.SeekStart); seekErr != nil {
		if cErr := src.Close(); cErr != nil {
			log.Printf("failed to close src: %v", cErr)
		}
		return nil, uuid.Nil, "", fmt.Errorf("seek failed: %w", seekErr)
	}
	return src, parsedUUID, ext, nil
}

func (m *Manager) savePhoto(fileHeader *multipart.FileHeader, clientUUID, folder, suffix string) (string, error) {
	src, parsedUUID, ext, err := m.validateAndOpen(fileHeader, clientUUID)
	if err != nil {
		return "", err
	}
	defer func() {
		if cErr := src.Close(); cErr != nil {
			log.Printf("failed to close src file: %v", cErr)
		}
	}()

	var basename string
	if suffix != "" {
		basename = fmt.Sprintf("%s_%s%s", parsedUUID.String(), suffix, ext)
	} else {
		basename = fmt.Sprintf("%s%s", parsedUUID.String(), ext)
	}

	targetPath := filepath.Join(m.baseDir, folder, basename)
	cleanTarget := filepath.Clean(targetPath)
	if !strings.HasPrefix(cleanTarget, m.baseDir) {
		return "", ErrPathTraversal
	}

	dst, err := os.OpenFile(cleanTarget, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return "", fmt.Errorf("failed to create destination file: %w", err)
	}
	defer func() {
		if cErr := dst.Close(); cErr != nil {
			log.Printf("failed to close dst file: %v", cErr)
		}
	}()

	written, err := io.Copy(dst, io.LimitReader(src, MaxFileSize+1))
	if err != nil {
		return "", fmt.Errorf("copy failed: %w", err)
	}
	if written > MaxFileSize {
		if rmErr := os.Remove(cleanTarget); rmErr != nil {
			log.Printf("failed to remove oversized file: %v", rmErr)
		}
		return "", ErrFileTooLarge
	}

	return basename, nil
}

// DetectImageExtension sniffs content bytes to verify JPEG or PNG magic bytes.
func DetectImageExtension(data []byte) (string, bool) {
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return ".jpg", true
	}
	if len(data) >= 8 && data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G' &&
		data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A {
		return ".png", true
	}
	return "", false
}

// OpenAttachment opens a stored issue photo after validating its controlled path.
// Callers must authorize the owning issue before invoking this method.
func (m *Manager) OpenAttachment(folder, basename string) (*os.File, error) {
	if folder != "before" && folder != "detail" && folder != "after" {
		return nil, ErrPathTraversal
	}
	if basename == "" || filepath.Base(basename) != basename || basename == "." || basename == ".." {
		return nil, ErrPathTraversal
	}

	root, err := filepath.EvalSymlinks(m.baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve storage root: %w", err)
	}
	target := filepath.Join(root, folder, basename)
	cleanTarget := filepath.Clean(target)
	rel, err := filepath.Rel(root, cleanTarget)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}
	resolvedTarget, err := filepath.EvalSymlinks(cleanTarget)
	if err != nil {
		return nil, err
	}
	rel, err = filepath.Rel(root, resolvedTarget)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}
	return os.Open(resolvedTarget)
}

// FileServer returns an http.Handler serving files from baseDir with immutable cache header.
func (m *Manager) FileServer() http.Handler {
	fileServer := http.FileServer(http.Dir(m.baseDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		fileServer.ServeHTTP(w, r)
	})
}
