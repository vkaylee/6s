package issue

import "testing"

func TestFormatPhotoURL_NormalizesLegacyUploads(t *testing.T) {
	tests := []struct {
		name     string
		folder   string
		filename string
		want     string
	}{
		{
			name:     "before legacy path",
			folder:   "before",
			filename: "/uploads/before/legacy-wide.jpg",
			want:     "/api/issues/42/media/before/legacy-wide.jpg",
		},
		{
			name:     "detail legacy path",
			folder:   "detail",
			filename: "/uploads/detail/legacy-detail.png",
			want:     "/api/issues/42/media/detail/legacy-detail.png",
		},
		{
			name:     "after legacy path",
			folder:   "after",
			filename: "/uploads/after/legacy-after.jpg",
			want:     "/api/issues/42/media/after/legacy-after.jpg",
		},
		{
			name:     "current basename",
			folder:   "before",
			filename: "current-wide.jpg",
			want:     "/api/issues/42/media/before/current-wide.jpg",
		},
		{
			name:     "already protected URL",
			folder:   "before",
			filename: "/api/issues/42/media/before/current-wide.jpg",
			want:     "/api/issues/42/media/before/current-wide.jpg",
		},
		{
			name:     "data URL",
			folder:   "before",
			filename: "data:image/jpeg;base64,abc",
			want:     "data:image/jpeg;base64,abc",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatPhotoURL(42, tt.folder, tt.filename); got != tt.want {
				t.Fatalf("formatPhotoURL() = %q, want %q", got, tt.want)
			}
		})
	}
}
