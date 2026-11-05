package printagent

import (
	"bytes"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"time"
	"unicode"

	tmt88v "github.com/AkatukiSora/tm-t88v"
	"github.com/AkatukiSora/tm-t88v/escpos"
)

type ReceiptDocumentV1 struct {
	Version          int      `json:"version"`
	Title            string   `json:"title"`
	NumberText       string   `json:"numberText"`
	ReservationDate  string   `json:"reservationDate,omitempty"`
	ReservationStart string   `json:"reservationStart,omitempty"`
	IssuedAtText     string   `json:"issuedAtText"`
	QRURL            string   `json:"qrURL"`
	Guidance         []string `json:"guidance"`
	jobID            string
}

type receiptBuffer struct {
	bytes.Buffer
}

func (*receiptBuffer) Read([]byte) (int, error) { return 0, io.EOF }
func (*receiptBuffer) Close() error             { return nil }
func (*receiptBuffer) Flush() error             { return nil }

var _ tmt88v.Transport = (*receiptBuffer)(nil)

func BuildReceipt(job PrintJob, legacyPublicBaseURL *url.URL) (ReceiptDocumentV1, error) {
	if err := job.Payload.validate(); err != nil {
		return ReceiptDocumentV1{}, err
	}

	document := ReceiptDocumentV1{
		Version:      1,
		NumberText:   strconv.Itoa(job.Payload.TicketNumber),
		IssuedAtText: "発券日時: ",
		jobID:        job.ID,
	}
	if job.Payload.SchemaVersion == 2 {
		location, err := time.LoadLocation(job.Payload.TimeZone)
		if err != nil {
			return ReceiptDocumentV1{}, fmt.Errorf("load receipt timezone: %w", err)
		}
		document.Title = job.Payload.Copy.ReceiptTitle
		document.QRURL = job.Payload.PublicURL
		document.Guidance = []string{job.Payload.Copy.ArrivalGuidance}
		document.IssuedAtText += job.Payload.IssuedAt.In(location).Format("2006-01-02 15:04:05")
		if job.Payload.Reservation.Kind == "slot" {
			startsAt := job.Payload.Reservation.StartsAt.In(location)
			document.ReservationDate = startsAt.Format("2006-01-02")
			document.ReservationStart = startsAt.Format("15:04")
		}
		return document, nil
	}

	if legacyPublicBaseURL == nil || legacyPublicBaseURL.Scheme == "" || legacyPublicBaseURL.Host == "" {
		return ReceiptDocumentV1{}, fmt.Errorf("legacy receipt requires a public base URL")
	}
	document.Title = "旧整理券・スタッフへ確認"
	if job.Payload.Kind == slotPayloadKind {
		location := time.FixedZone("JST", 9*60*60)
		startsAt := job.Payload.SlotStartsAt.In(location)
		document.Title = "時間枠整理券"
		document.ReservationDate = startsAt.Format("2006-01-02")
		document.ReservationStart = startsAt.Format("15:04")
		document.Guidance = []string{"機材・変更内容はQRでご確認ください\n予約時刻にお越しください"}
	}
	document.IssuedAtText += job.Payload.IssuedAt.In(time.FixedZone("JST", 9*60*60)).Format("2006-01-02 15:04:05")
	document.QRURL = legacyPublicBaseURL.JoinPath("ticket", job.Payload.PublicToken).String()
	return document, nil
}

func EncodeReceipt(document ReceiptDocumentV1) ([]byte, error) {
	if document.Version != 1 || !plainReceiptText(document.Title) || !plainReceiptText(document.NumberText) || !plainReceiptText(document.IssuedAtText) || document.QRURL == "" {
		return nil, fmt.Errorf("receipt document is incomplete or contains non-text content")
	}
	if document.ReservationDate == "" && document.ReservationStart != "" {
		return nil, fmt.Errorf("reservation date is required with reservation start")
	}
	if document.ReservationDate != "" && (document.ReservationStart == "" || !plainReceiptText(document.ReservationDate) || !plainReceiptText(document.ReservationStart)) {
		return nil, fmt.Errorf("reservation date and start must be plain text")
	}
	for _, guidance := range document.Guidance {
		if !plainReceiptText(guidance) {
			return nil, fmt.Errorf("receipt guidance must be plain text")
		}
	}
	transport := &receiptBuffer{}
	printer, err := tmt88v.New(transport)
	if err != nil {
		return nil, fmt.Errorf("create receipt encoder: %w", err)
	}
	if err := printer.Init(); err != nil {
		return nil, fmt.Errorf("initialize receipt: %w", err)
	}
	// FS & enters kanji mode and FS C 1 selects Shift_JIS, matching the encoder.
	if err := printer.Raw([]byte{0x1c, 0x26, 0x1c, 0x43, 0x01}); err != nil {
		return nil, fmt.Errorf("select kanji mode: %w", err)
	}
	if err := printer.SetAlignment(escpos.AlignCenter); err != nil {
		return nil, fmt.Errorf("center receipt: %w", err)
	}
	if err := printer.SetBold(true); err != nil {
		return nil, fmt.Errorf("bold receipt header: %w", err)
	}
	if err := printer.PrintText(document.Title + "\n"); err != nil {
		return nil, fmt.Errorf("encode receipt header: %w", err)
	}
	if err := printer.SetCharSize(2, 2); err != nil {
		return nil, fmt.Errorf("enlarge ticket number: %w", err)
	}
	if err := printer.PrintText(document.NumberText + "\n"); err != nil {
		return nil, fmt.Errorf("encode ticket number: %w", err)
	}
	if err := printer.SetCharSize(0, 0); err != nil {
		return nil, fmt.Errorf("restore ticket number size: %w", err)
	}
	if err := printer.SetBold(false); err != nil {
		return nil, fmt.Errorf("restore receipt text: %w", err)
	}
	if document.ReservationDate != "" {
		if document.ReservationStart == "" {
			return nil, fmt.Errorf("reservation start is required with reservation date")
		}
		for _, item := range []struct {
			label string
			value string
		}{
			{label: "予約日: ", value: document.ReservationDate},
			{label: "開始: ", value: document.ReservationStart},
		} {
			if err := printer.PrintText(item.label); err != nil {
				return nil, fmt.Errorf("encode reservation label: %w", err)
			}
			if err := printer.SetCharSize(2, 2); err != nil {
				return nil, fmt.Errorf("enlarge reservation value: %w", err)
			}
			if err := printer.PrintText(item.value + "\n"); err != nil {
				return nil, fmt.Errorf("encode reservation value: %w", err)
			}
			if err := printer.SetCharSize(0, 0); err != nil {
				return nil, fmt.Errorf("restore reservation value size: %w", err)
			}
		}
	}
	for _, guidance := range document.Guidance {
		if err := printer.PrintText(guidance + "\n"); err != nil {
			return nil, fmt.Errorf("encode reservation guidance: %w", err)
		}
	}
	if err := printer.PrintText(document.IssuedAtText + "\n"); err != nil {
		return nil, fmt.Errorf("encode issue time: %w", err)
	}
	if err := printer.PrintQRCode([]byte(document.QRURL)); err != nil {
		return nil, fmt.Errorf("encode ticket QR code: %w", err)
	}
	if err := printer.Feed(1); err != nil {
		return nil, fmt.Errorf("feed receipt: %w", err)
	}
	if err := printer.Cut(); err != nil {
		return nil, fmt.Errorf("cut receipt: %w", err)
	}
	if err := printer.Flush(); err != nil {
		return nil, fmt.Errorf("flush receipt buffer: %w", err)
	}
	return append([]byte(nil), transport.Bytes()...), nil
}

func RenderReceipt(job PrintJob, publicBaseURL *url.URL) ([]byte, error) {
	document, err := BuildReceipt(job, publicBaseURL)
	if err != nil {
		return nil, err
	}
	return EncodeReceipt(document)
}

func plainReceiptText(text string) bool {
	if text == "" {
		return false
	}
	for _, character := range text {
		if unicode.IsControl(character) && character != '\n' {
			return false
		}
	}
	return true
}
