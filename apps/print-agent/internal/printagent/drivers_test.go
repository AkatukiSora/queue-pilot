package printagent

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestJSONFileDriverCreatesIdempotentPreviewByJobID(t *testing.T) {
	outputDir := filepath.Join(t.TempDir(), "previews")
	baseURL, err := url.Parse("https://tickets.example.test")
	if err != nil {
		t.Fatal(err)
	}
	job := PrintJob{
		ID: "11111111-1111-4111-8111-111111111111",
		Payload: JobPayload{
			SchemaVersion: 2,
			TicketNumber:  12,
			Reservation:   Reservation{Kind: "legacy"},
			IssuedAt:      time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC),
			TimeZone:      "Asia/Tokyo",
			PublicURL:     "https://tickets.example.test/ticket/token",
			Copy:          ReceiptCopy{ReceiptTitle: "Ticket", ArrivalGuidance: "Ask staff."},
		},
	}
	document, err := BuildReceipt(job, baseURL)
	if err != nil {
		t.Fatal(err)
	}
	driver := JSONFileDriver{OutputDir: outputDir}
	for attempt := 0; attempt < 2; attempt++ {
		outcome, err := driver.Output(context.Background(), document)
		if err != nil || outcome != OutcomePrinted {
			t.Fatalf("Output() attempt %d = (%q, %v)", attempt+1, outcome, err)
		}
	}
	path := filepath.Join(outputDir, job.ID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var preview struct {
		JobID   string            `json:"jobId"`
		Preview bool              `json:"preview"`
		Receipt ReceiptDocumentV1 `json:"receipt"`
	}
	if err := json.Unmarshal(data, &preview); err != nil {
		t.Fatal(err)
	}
	if preview.JobID != job.ID || !preview.Preview || preview.Receipt.Title != document.Title {
		t.Errorf("preview content = %#v", preview)
	}

	conflicting := document
	conflicting.Title = "Different content"
	outcome, err := driver.Output(context.Background(), conflicting)
	if err == nil || outcome != OutcomeFailed {
		t.Fatalf("conflicting duplicate = (%q, %v), want failed", outcome, err)
	}
	current, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(current) != string(data) {
		t.Error("conflicting job ID overwrote the existing preview")
	}
}
