package printagent

import (
	"net/url"
	"testing"
	"time"
)

func TestBuildReceiptUsesVersion2SnapshotTimezoneAndCopy(t *testing.T) {
	startsAt, err := time.Parse(time.RFC3339, "2026-11-03T14:30:00Z")
	if err != nil {
		t.Fatal(err)
	}
	issuedAt, err := time.Parse(time.RFC3339, "2026-11-03T15:45:06Z")
	if err != nil {
		t.Fatal(err)
	}
	job := PrintJob{
		ID: "11111111-1111-4111-8111-111111111111",
		Payload: JobPayload{
			SchemaVersion: 2,
			TicketNumber:  17,
			Reservation:   Reservation{Kind: "slot", StartsAt: startsAt},
			IssuedAt:      issuedAt,
			TimeZone:      "America/Los_Angeles",
			PublicURL:     "https://tickets.example.test/ticket/public-token",
			Copy:          ReceiptCopy{ReceiptTitle: "Workshop pass", ArrivalGuidance: "Arrive at the west entrance."},
		},
	}
	legacyBase, err := url.Parse("https://ignored.example.test")
	if err != nil {
		t.Fatal(err)
	}

	document, err := BuildReceipt(job, legacyBase)
	if err != nil {
		t.Fatalf("BuildReceipt() error = %v", err)
	}
	if document.Version != 1 || document.Title != "Workshop pass" || document.NumberText != "17" {
		t.Errorf("document header = %#v", document)
	}
	if document.ReservationDate != "2026-11-03" || document.ReservationStart != "06:30" {
		t.Errorf("reservation snapshot = %q %q", document.ReservationDate, document.ReservationStart)
	}
	if document.IssuedAtText != "発券日時: 2026-11-03 07:45:06" {
		t.Errorf("issuedAtText = %q", document.IssuedAtText)
	}
	if document.QRURL != "https://tickets.example.test/ticket/public-token" {
		t.Errorf("QRURL = %q", document.QRURL)
	}
	if len(document.Guidance) != 1 || document.Guidance[0] != "Arrive at the west entrance." {
		t.Errorf("guidance = %#v", document.Guidance)
	}
}

func TestBuildReceiptV2LegacyReservationDoesNotInventSlot(t *testing.T) {
	issuedAt := time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC)
	job := PrintJob{Payload: JobPayload{
		SchemaVersion: 2,
		TicketNumber:  5,
		Reservation:   Reservation{Kind: "legacy"},
		IssuedAt:      issuedAt,
		TimeZone:      "Asia/Tokyo",
		PublicURL:     "https://tickets.example.test/ticket/token",
		Copy:          ReceiptCopy{ReceiptTitle: "Ticket", ArrivalGuidance: "Ask staff for help."},
	}}
	document, err := BuildReceipt(job, nil)
	if err != nil {
		t.Fatalf("BuildReceipt() error = %v", err)
	}
	if document.ReservationDate != "" || document.ReservationStart != "" {
		t.Errorf("legacy v2 reservation fabricated slot: %#v", document)
	}
}

func TestBuildReceiptRejectsUnsupportedTimezoneAndPublicURL(t *testing.T) {
	valid := JobPayload{
		SchemaVersion: 2,
		TicketNumber:  1,
		Reservation:   Reservation{Kind: "legacy"},
		IssuedAt:      time.Date(2026, time.November, 3, 9, 0, 0, 0, time.UTC),
		TimeZone:      "Asia/Tokyo",
		PublicURL:     "https://tickets.example.test/ticket/token",
		Copy:          ReceiptCopy{ReceiptTitle: "Ticket", ArrivalGuidance: "Ask staff."},
	}
	for _, test := range []struct {
		name   string
		change func(*JobPayload)
	}{
		{name: "unknown timezone", change: func(payload *JobPayload) { payload.TimeZone = "Mars/Olympus" }},
		{name: "local timezone alias", change: func(payload *JobPayload) { payload.TimeZone = "Local" }},
		{name: "non-http public URL", change: func(payload *JobPayload) { payload.PublicURL = "file:///etc/passwd" }},
		{name: "public URL has extra path segment", change: func(payload *JobPayload) { payload.PublicURL = "https://tickets.example.test/ticket/token/other" }},
		{name: "copy contains ESC control", change: func(payload *JobPayload) { payload.Copy.ReceiptTitle = "Ticket\x1b@" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			payload := valid
			test.change(&payload)
			if _, err := BuildReceipt(PrintJob{Payload: payload}, nil); err == nil {
				t.Fatal("BuildReceipt() accepted invalid version 2 data")
			}
		})
	}
}
