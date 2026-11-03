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
			name:            "legacy ticket keeps number and issue time but omits group size",
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
				"旧整理券・スタッフへ確認\n",
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
			partySize, err := encoder.Encode(fmt.Sprintf("人数: %d名\n", test.partySize))
			if err != nil {
				t.Fatalf("encode forbidden text: %v", err)
			}
			if bytes.Contains(data, partySize) {
				t.Errorf("legacy receipt unexpectedly contains party size %d", test.partySize)
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

func TestRenderSlotReceiptPrintsJSTDateAndStartOnly(t *testing.T) {
	baseURL, err := url.Parse("https://tickets.example.test")
	if err != nil {
		t.Fatal(err)
	}
	job := PrintJob{Payload: JobPayload{
		Kind:         "slot",
		TicketNumber: 17,
		SlotStartsAt: time.Date(2026, time.November, 3, 1, 0, 0, 0, time.UTC),
		PublicToken:  "0123456789abcdefghijkl",
		IssuedAt:     time.Date(2026, time.November, 2, 12, 34, 56, 0, time.UTC),
	}}
	data, err := RenderReceipt(job, baseURL)
	if err != nil {
		t.Fatalf("RenderReceipt() error = %v", err)
	}

	encoder := tmencoding.NewShiftJISEncoder()
	for _, text := range []string{
		"時間枠整理券\n",
		"予約日: ",
		"2026-11-03\n",
		"開始: ",
		"10:00\n",
		"機材・変更内容はQRでご確認ください\n予約時刻にお越しください\n",
	} {
		encoded, err := encoder.Encode(text)
		if err != nil {
			t.Fatalf("encode expected text: %v", err)
		}
		if !bytes.Contains(data, encoded) {
			t.Errorf("ESC/POS bytes do not contain Shift-JIS text %q", text)
		}
	}

	const enlargedCharacterSize = 0x11
	for _, check := range []struct {
		text string
		want byte
	}{
		{text: "予約日: ", want: 0},
		{text: "2026-11-03", want: enlargedCharacterSize},
		{text: "開始: ", want: 0},
		{text: "10:00", want: enlargedCharacterSize},
		{text: "機材・変更内容はQRでご確認ください", want: 0},
		{text: "発券日時: 2026-11-02 21:34:56", want: 0},
	} {
		encoded, err := encoder.Encode(check.text)
		if err != nil {
			t.Fatalf("encode character-size check text: %v", err)
		}
		position := bytes.Index(data, encoded)
		if position < 0 {
			t.Fatalf("ESC/POS bytes do not contain character-size check text %q", check.text)
		}
		effectiveSize := byte(0)
		for index := 0; index+2 < position; index++ {
			if data[index] == 0x1d && data[index+1] == 0x21 {
				effectiveSize = data[index+2]
				index += 2
			}
		}
		if effectiveSize != check.want {
			t.Errorf("%q has effective GS ! size 0x%02x, want 0x%02x", check.text, effectiveSize, check.want)
		}
	}

	for _, text := range []string{"Quest 3", "Quest 3S", "Steam Frame", "Beyond2", "人数", "10:25", "10:30"} {
		encoded, err := encoder.Encode(text)
		if err != nil {
			t.Fatalf("encode forbidden text: %v", err)
		}
		if bytes.Contains(data, encoded) {
			t.Errorf("ESC/POS bytes unexpectedly contain %q", text)
		}
	}

	qrURL := baseURL.String() + "/ticket/" + job.Payload.PublicToken
	if expected := escpos.StoreQRData([]byte(qrURL)).Bytes(); !bytes.Contains(data, expected) {
		t.Error("ESC/POS bytes do not contain the existing QR payload")
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
		t.Fatalf("valid legacy receipt rejected: %v", err)
	}

	invalid := []struct {
		name    string
		payload JobPayload
	}{
		{name: "non-positive ticket number", payload: JobPayload{PartySize: 1, PublicToken: "token", IssuedAt: job.Payload.IssuedAt}},
		{name: "unknown payload kind", payload: JobPayload{Kind: "future", TicketNumber: 1, PublicToken: "token", IssuedAt: job.Payload.IssuedAt}},
		{name: "slot without start", payload: JobPayload{Kind: "slot", TicketNumber: 1, PublicToken: "token", IssuedAt: job.Payload.IssuedAt}},
		{name: "slot with legacy group size", payload: JobPayload{Kind: "slot", TicketNumber: 1, PartySize: 1, SlotStartsAt: time.Date(2026, time.November, 3, 1, 0, 0, 0, time.UTC), PublicToken: "token", IssuedAt: job.Payload.IssuedAt}},
		{name: "slot with seconds", payload: JobPayload{Kind: "slot", TicketNumber: 1, SlotStartsAt: time.Date(2026, time.November, 3, 1, 0, 1, 0, time.UTC), PublicToken: "token", IssuedAt: job.Payload.IssuedAt}},
	}
	for _, test := range invalid {
		t.Run(test.name, func(t *testing.T) {
			if _, err := RenderReceipt(PrintJob{Payload: test.payload}, baseURL); err == nil {
				t.Fatal("invalid payload was accepted")
			}
		})
	}
}
