package printagent

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestClaimDecodesLegacyAndSlotPayloads(t *testing.T) {
	tests := []struct {
		name          string
		response      string
		wantKind      string
		wantPartySize int
		wantStart     string
		wantError     bool
	}{
		{
			name:          "legacy payload without kind",
			response:      testJobJSON,
			wantPartySize: 3,
		},
		{
			name:      "slot payload",
			response:  `{"job":{"id":"11111111-1111-4111-8111-111111111111","ticketId":"22222222-2222-4222-8222-222222222222","status":"printing","attempt":1,"leaseToken":"lease-test-token","payload":{"kind":"slot","ticketNumber":42,"slotStartsAt":"2026-11-03T01:00:00Z","publicToken":"0123456789abcdefghijkl","issuedAt":"2026-11-02T12:34:56.000Z"}}}`,
			wantKind:  "slot",
			wantStart: "2026-11-03T01:00:00Z",
		},
		{
			name:      "unsupported payload kind",
			response:  `{"job":{"id":"11111111-1111-4111-8111-111111111111","ticketId":"22222222-2222-4222-8222-222222222222","status":"printing","attempt":1,"leaseToken":"lease-test-token","payload":{"kind":"future","ticketNumber":42,"publicToken":"0123456789abcdefghijkl","issuedAt":"2026-11-02T12:34:56.000Z"}}}`,
			wantError: true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.Method != http.MethodPost || request.URL.Path != "/api/agent/print-jobs/claim" {
					http.NotFound(writer, request)
					return
				}
				writer.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(writer, test.response)
			}))
			defer server.Close()

			baseURL, err := url.Parse(server.URL)
			if err != nil {
				t.Fatal(err)
			}
			client := &APIClient{baseURL: baseURL, http: server.Client()}
			job, err := client.Claim(context.Background())
			if test.wantError {
				if err == nil {
					t.Fatal("Claim() accepted an unsupported payload kind")
				}
				return
			}
			if err != nil {
				t.Fatalf("Claim() error = %v", err)
			}
			if job == nil {
				t.Fatal("Claim() returned no job")
			}
			if job.Payload.Kind != test.wantKind || job.Payload.PartySize != test.wantPartySize {
				t.Errorf("decoded payload kind/partySize = %q/%d, want %q/%d", job.Payload.Kind, job.Payload.PartySize, test.wantKind, test.wantPartySize)
			}
			if test.wantStart != "" {
				wantStart, err := time.Parse(time.RFC3339, test.wantStart)
				if err != nil {
					t.Fatal(err)
				}
				if !job.Payload.SlotStartsAt.Equal(wantStart) {
					t.Errorf("decoded slot start = %s, want %s", job.Payload.SlotStartsAt, wantStart)
				}
			}
		})
	}
}
