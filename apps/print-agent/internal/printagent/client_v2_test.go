package printagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestVersion2ClientClaimsOnlyVersion2AndReportsOnV3Route(t *testing.T) {
	var claimSeen, resultSeen bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/api/v3/agent/print-jobs/claim" {
			claimSeen = true
			if request.Method != http.MethodPost || request.Header.Get("Content-Type") != "application/json" {
				http.Error(writer, "unexpected claim request", http.StatusBadRequest)
				return
			}
			var body struct {
				AcceptedPayloadVersions []int `json:"acceptedPayloadVersions"`
			}
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil || len(body.AcceptedPayloadVersions) != 1 || body.AcceptedPayloadVersions[0] != 2 {
				http.Error(writer, "wrong payload versions", http.StatusBadRequest)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(writer, `{"job":{"id":"11111111-1111-4111-8111-111111111111","ticketId":"22222222-2222-4222-8222-222222222222","status":"printing","attempt":1,"leaseToken":"lease-test-token","payload":{"schemaVersion":2,"ticketNumber":17,"reservation":{"kind":"slot","startsAt":"2026-11-03T14:30:00Z"},"issuedAt":"2026-11-03T15:45:06Z","timeZone":"America/Los_Angeles","publicURL":"https://tickets.example.test/ticket/public-token","copy":{"receiptTitle":"Workshop pass","arrivalGuidance":"Arrive at the west entrance."}}}}`)
			return
		}
		if request.URL.Path == "/api/v3/agent/print-jobs/11111111-1111-4111-8111-111111111111/result" {
			resultSeen = true
			writer.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(writer, `{"job":{"status":"printed"}}`)
			return
		}
		http.NotFound(writer, request)
	}))
	defer server.Close()
	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := NewAPIClient(Config{APIBaseURL: baseURL, AgentToken: testAgentToken, WireVersion: 2})
	job, err := client.Claim(context.Background())
	if err != nil {
		t.Fatalf("Claim() error = %v", err)
	}
	if job == nil || job.Payload.SchemaVersion != 2 || job.Payload.PublicURL != "https://tickets.example.test/ticket/public-token" {
		t.Fatalf("claimed job = %#v", job)
	}
	if err := client.ReportResult(context.Background(), *job, OutcomePrinted, ""); err != nil {
		t.Fatalf("ReportResult() error = %v", err)
	}
	if !claimSeen || !resultSeen {
		t.Errorf("v3 claim/result routes seen = %t/%t", claimSeen, resultSeen)
	}
}

func TestVersion2ClientDoesNotFallbackWhenServerRejectsClaim(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		if request.URL.Path == "/api/v3/agent/print-jobs/claim" {
			http.Error(writer, `{"error":{"code":"incompatible_agent"}}`, http.StatusConflict)
			return
		}
		http.NotFound(writer, request)
	}))
	defer server.Close()
	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client := NewAPIClient(Config{APIBaseURL: baseURL, AgentToken: testAgentToken, WireVersion: 2})
	if _, err := client.Claim(context.Background()); err == nil || !errors.Is(err, ErrIncompatibleAgent) {
		t.Fatalf("Claim() error = %v, want incompatible-agent error", err)
	}
	if len(paths) != 1 || paths[0] != "/api/v3/agent/print-jobs/claim" {
		t.Errorf("claim request paths = %#v, want v3 only", paths)
	}
}

func TestVersion2PayloadRejectsMixedLegacyFields(t *testing.T) {
	payload := JobPayload{
		SchemaVersion: 2,
		TicketNumber:  1,
		PartySize:     2,
		Reservation:   Reservation{Kind: "legacy"},
		IssuedAt:      time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC),
		TimeZone:      "Asia/Tokyo",
		PublicURL:     "https://tickets.example.test/ticket/token",
		Copy:          ReceiptCopy{ReceiptTitle: "Ticket", ArrivalGuidance: "Ask staff."},
	}
	if err := payload.validate(); err == nil {
		t.Fatal("version 2 payload with a legacy partySize was accepted")
	}
}
