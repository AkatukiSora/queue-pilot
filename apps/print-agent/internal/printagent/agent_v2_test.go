package printagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestProcessOnceVersion2WritesPreviewAndReportsOnV3(t *testing.T) {
	outputDir := filepath.Join(t.TempDir(), "preview")
	var claimBody struct {
		AcceptedPayloadVersions []int `json:"acceptedPayloadVersions"`
	}
	var resultOutcome Outcome
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/v3/agent/print-jobs/claim":
			if err := json.NewDecoder(request.Body).Decode(&claimBody); err != nil {
				http.Error(writer, "bad request", http.StatusBadRequest)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(writer, `{"job":{"id":"11111111-1111-4111-8111-111111111111","ticketId":"22222222-2222-4222-8222-222222222222","status":"printing","attempt":1,"leaseToken":"lease-test-token","payload":{"schemaVersion":2,"ticketNumber":17,"reservation":{"kind":"legacy"},"issuedAt":"2026-11-03T09:00:00Z","timeZone":"Asia/Tokyo","publicURL":"https://tickets.example.test/ticket/token","copy":{"receiptTitle":"Queue pass","arrivalGuidance":"Arrive at the west entrance."}}}}`)
		case "/api/v3/agent/print-jobs/11111111-1111-4111-8111-111111111111/result":
			var body struct {
				Outcome Outcome `json:"outcome"`
			}
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				http.Error(writer, "bad result", http.StatusBadRequest)
				return
			}
			resultOutcome = body.Outcome
			writer.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(writer, `{"job":{"status":"printed"}}`)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	config := Config{
		APIBaseURL:  baseURL,
		AgentToken:  testAgentToken,
		WireVersion: 2,
		PrinterID:   "11111111-1111-4111-8111-111111111111",
		DriverKind:  "json-file",
		OutputDir:   outputDir,
	}
	if err := ProcessOnce(context.Background(), config, NewAPIClient(config), slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatalf("ProcessOnce() error = %v", err)
	}
	if len(claimBody.AcceptedPayloadVersions) != 1 || claimBody.AcceptedPayloadVersions[0] != 2 {
		t.Errorf("accepted payload versions = %#v", claimBody.AcceptedPayloadVersions)
	}
	if resultOutcome != OutcomePrinted {
		t.Errorf("reported outcome = %q, want printed for completed preview output", resultOutcome)
	}
	previewPath := filepath.Join(outputDir, "11111111-1111-4111-8111-111111111111.json")
	data, err := os.ReadFile(previewPath)
	if err != nil {
		t.Fatal(err)
	}
	var preview struct {
		Preview bool `json:"preview"`
		Receipt struct {
			Title string `json:"title"`
			QRURL string `json:"qrURL"`
		} `json:"receipt"`
	}
	if err := json.Unmarshal(data, &preview); err != nil {
		t.Fatal(err)
	}
	if !preview.Preview || preview.Receipt.Title != "Queue pass" || preview.Receipt.QRURL != "https://tickets.example.test/ticket/token" {
		t.Errorf("preview = %#v", preview)
	}
}

func TestRunStopsWhenVersion2ClaimIsRejected(t *testing.T) {
	calls := 0
	want := fmt.Errorf("claim print job: %w", ErrIncompatibleAgent)
	err := run(context.Background(), slog.New(slog.NewTextHandler(io.Discard, nil)), func() error {
		calls++
		return want
	})
	if !errors.Is(err, ErrIncompatibleAgent) {
		t.Fatalf("run() error = %v, want incompatible-agent error", err)
	}
	if calls != 1 {
		t.Errorf("claim attempts = %d, want no fallback/retry", calls)
	}
}

func TestBuildReceiptUsesEmbeddedTimezoneDatabase(t *testing.T) {
	job := PrintJob{Payload: JobPayload{
		SchemaVersion: 2,
		TicketNumber:  1,
		Reservation:   Reservation{Kind: "legacy"},
		IssuedAt:      time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC),
		TimeZone:      "Pacific/Chatham",
		PublicURL:     "https://tickets.example.test/ticket/token",
		Copy:          ReceiptCopy{ReceiptTitle: "Ticket", ArrivalGuidance: "Ask staff."},
	}}
	if _, err := BuildReceipt(job, nil); err != nil {
		t.Fatalf("BuildReceipt() failed to load IANA timezone: %v", err)
	}
}
