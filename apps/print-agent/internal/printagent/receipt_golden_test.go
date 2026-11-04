package printagent

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"
)

func TestReceiptEncodingGolden(t *testing.T) {
	slotJob := testJob()
	slotJob.Payload.Kind = slotPayloadKind
	slotJob.Payload.PartySize = 0
	slotJob.Payload.SlotStartsAt = time.Date(2026, time.November, 3, 14, 30, 0, 0, time.UTC)
	snapshotJob := PrintJob{
		ID: "11111111-1111-4111-8111-111111111111",
		Payload: JobPayload{
			SchemaVersion: 2,
			TicketNumber:  17,
			Reservation:   Reservation{Kind: "slot", StartsAt: time.Date(2026, time.November, 3, 14, 30, 0, 0, time.UTC)},
			IssuedAt:      time.Date(2026, time.November, 3, 15, 45, 6, 0, time.UTC),
			TimeZone:      "America/Los_Angeles",
			PublicURL:     "https://tickets.example.test/ticket/public-token",
			Copy:          ReceiptCopy{ReceiptTitle: "Workshop pass", ArrivalGuidance: "Arrive at the west entrance."},
		},
	}
	tests := []struct {
		name string
		job  PrintJob
		want string
	}{
		{name: "legacy ticket", job: testJob(), want: "5e97ed061e03fc25cc8c3ad494c2720669488d595063819e177e3feeef45804e"},
		{name: "slot ticket", job: slotJob, want: "790ea4c2108e573d5732e9817901cb597633af4cbabf2938b55c1d8c3b9cc60c"},
		{name: "version 2 snapshot", job: snapshotJob, want: "304f95ed1cdab7af741c8d1f56ead708af5573992ec61cf3f30661b1ac8cb748"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document, err := BuildReceipt(test.job, mustParseURL(t, "https://tickets.example.test"))
			if err != nil {
				t.Fatal(err)
			}
			data, err := EncodeReceipt(document)
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(data)
			got := hex.EncodeToString(digest[:])
			if got != test.want {
				t.Errorf("receipt bytes SHA-256 = %s, want %s", got, test.want)
			}
		})
	}
}
