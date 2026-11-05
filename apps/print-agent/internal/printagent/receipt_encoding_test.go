package printagent

import "testing"

func TestEncodeReceiptRejectsPrinterControlCharactersInDocument(t *testing.T) {
	document := testReceiptDocument(t)
	document.Title = "Ticket\x1b@"
	if _, err := EncodeReceipt(document); err == nil {
		t.Fatal("EncodeReceipt() accepted an ESC/POS control byte in receipt text")
	}
}
