package printagent

import (
	"bytes"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"time"

	tmt88v "github.com/AkatukiSora/tm-t88v"
	"github.com/AkatukiSora/tm-t88v/escpos"
)

func RenderReceipt(job PrintJob, publicBaseURL *url.URL) ([]byte, error) {
	if err := job.Payload.validate(); err != nil {
		return nil, err
	}

	qrURL := publicBaseURL.JoinPath("ticket", job.Payload.PublicToken).String()

	transport := &receiptBuffer{}
	printer, err := tmt88v.New(transport)
	if err != nil {
		return nil, fmt.Errorf("create receipt encoder: %w", err)
	}
	if err := printer.Init(); err != nil {
		return nil, fmt.Errorf("initialize receipt: %w", err)
	}
	// FS & enters kanji mode and FS C 1 selects Shift_JIS, matching the encoder.
	// Without them the printer interprets Shift_JIS bytes as single-byte text.
	if err := printer.Raw([]byte{0x1c, 0x26, 0x1c, 0x43, 0x01}); err != nil {
		return nil, fmt.Errorf("select kanji mode: %w", err)
	}
	if err := printer.SetAlignment(escpos.AlignCenter); err != nil {
		return nil, fmt.Errorf("center receipt: %w", err)
	}
	if err := printer.SetBold(true); err != nil {
		return nil, fmt.Errorf("bold receipt header: %w", err)
	}
	header := "旧整理券・スタッフへ確認\n"
	if job.Payload.Kind == slotPayloadKind {
		header = "時間枠整理券\n"
	}
	if err := printer.PrintText(header); err != nil {
		return nil, fmt.Errorf("encode receipt header: %w", err)
	}
	if err := printer.SetCharSize(2, 2); err != nil {
		return nil, fmt.Errorf("enlarge ticket number: %w", err)
	}
	if err := printer.PrintText(strconv.Itoa(job.Payload.TicketNumber) + "\n"); err != nil {
		return nil, fmt.Errorf("encode ticket number: %w", err)
	}
	if err := printer.SetCharSize(0, 0); err != nil {
		return nil, fmt.Errorf("restore ticket number size: %w", err)
	}
	if err := printer.SetBold(false); err != nil {
		return nil, fmt.Errorf("restore receipt text: %w", err)
	}
	if job.Payload.Kind == slotPayloadKind {
		slotStartsAtJST := job.Payload.SlotStartsAt.In(time.FixedZone("JST", 9*60*60))
		if err := printer.PrintText("予約日: " + slotStartsAtJST.Format("2006-01-02") + "\n"); err != nil {
			return nil, fmt.Errorf("encode reservation date: %w", err)
		}
		if err := printer.PrintText("開始: " + slotStartsAtJST.Format("15:04") + "\n"); err != nil {
			return nil, fmt.Errorf("encode reservation start: %w", err)
		}
		if err := printer.PrintText("機材・変更内容はQRでご確認ください\n予約時刻にお越しください\n"); err != nil {
			return nil, fmt.Errorf("encode reservation guidance: %w", err)
		}
	}
	issuedAtJST := job.Payload.IssuedAt.In(time.FixedZone("JST", 9*60*60))
	if err := printer.PrintText("発券日時: " + issuedAtJST.Format("2006-01-02 15:04:05") + "\n"); err != nil {
		return nil, fmt.Errorf("encode issue time: %w", err)
	}
	if err := printer.PrintQRCode([]byte(qrURL)); err != nil {
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

type receiptBuffer struct {
	bytes.Buffer
}

func (*receiptBuffer) Read([]byte) (int, error) { return 0, io.EOF }
func (*receiptBuffer) Close() error             { return nil }
func (*receiptBuffer) Flush() error             { return nil }

var _ tmt88v.Transport = (*receiptBuffer)(nil)
