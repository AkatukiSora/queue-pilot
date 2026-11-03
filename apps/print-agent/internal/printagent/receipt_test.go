package printagent

import (
	"bytes"
	"fmt"
	"net/url"
	"testing"
	"time"

	tmencoding "github.com/AkatukiSora/tm-t88v/encoding"
	"github.com/AkatukiSora/tm-t88v/escpos"
)

func TestRenderReceiptContainsRequiredESCPOSTableBytes(t *testing.T) {
	tests := []struct {
		name            string
		number          int
		partySize       int
		publicToken     string
		issuedAt        time.Time
		wantIssuedAtJST string
	}{
		{
			name:            "UTC timestamp is rendered in JST",
			number:          7,
			partySize:       1,
			publicToken:     "0123456789abcdefghijkl",
			issuedAt:        time.Date(2026, time.November, 1, 15, 30, 0, 0, time.UTC),
			wantIssuedAtJST: "2026-11-02 00:30:00",
		},
		{
			name:            "equivalent JST timestamp has the same output",
			number:          7,
			partySize:       1,
			publicToken:     "0123456789abcdefghijkl",
			issuedAt:        time.Date(2026, time.November, 2, 0, 30, 0, 0, time.FixedZone("JST", 9*60*60)),
			wantIssuedAtJST: "2026-11-02 00:30:00",
		},
		{
			name:            "large ticket number and group",
			number:          12345,
			partySize:       20,
			publicToken:     "abcdefghijklmnopqrstuv",
			issuedAt:        time.Date(2026, time.November, 3, 9, 8, 7, 0, time.FixedZone("JST", 9*60*60)),
			wantIssuedAtJST: "2026-11-03 09:08:07",
		},
	}

	baseURL, err := url.Parse("https://tickets.example.test")
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			job := PrintJob{Payload: JobPayload{
				TicketNumber: test.number,
				PartySize:    test.partySize,
				PublicToken:  test.publicToken,
				IssuedAt:     test.issuedAt,
			}}
			data, err := RenderReceipt(job, baseURL)
			if err != nil {
				t.Fatalf("RenderReceipt() error = %v", err)
			}

			encoder := tmencoding.NewShiftJISEncoder()
			for _, text := range []string{
				"整理券\n",
				fmt.Sprintf("人数: %d名\n", test.partySize),
				"発券日時: " + test.wantIssuedAtJST + "\n",
			} {
				encoded, err := encoder.Encode(text)
				if err != nil {
					t.Fatalf("encode expected text: %v", err)
				}
				if !bytes.Contains(data, encoded) {
					t.Errorf("ESC/POS bytes do not contain Shift-JIS text %q", text)
				}
			}

			qrURL := baseURL.String() + "/ticket/" + test.publicToken
			for name, expected := range map[string][]byte{
				"large-number character size": escpos.SetCharacterSize(2, 2).Bytes(),
				"ticket number":               []byte(fmt.Sprintf("%d\n", test.number)),
				"QR payload":                  escpos.StoreQRData([]byte(qrURL)).Bytes(),
				"feed and full cut":           escpos.FeedAndFullCut(6).Bytes(),
			} {
				if !bytes.Contains(data, expected) {
					t.Errorf("ESC/POS bytes do not contain %s", name)
				}
			}
		})
	}
}

func TestRenderReceiptRejectsInvalidPayload(t *testing.T) {
	job := PrintJob{Payload: JobPayload{
		TicketNumber: 1,
		PartySize:    1,
		PublicToken:  "token",
		IssuedAt:     time.Now(),
	}}
	baseURL, err := url.Parse("https://tickets.example.test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RenderReceipt(job, baseURL); err != nil {
		t.Fatalf("valid receipt rejected: %v", err)
	}

	job.Payload.TicketNumber = 0
	if _, err := RenderReceipt(job, baseURL); err == nil {
		t.Fatal("invalid ticket number was accepted")
	}
}
