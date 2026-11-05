package printagent

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/url"
	"testing"
	"time"
)

func TestEscposTCPDriverReturnsCancellationWithoutCallingItTimeout(t *testing.T) {
	document, err := BuildReceipt(testJob(), mustParseURL(t, "https://tickets.example.test"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	outcome, err := (EscposTCPDriver{Address: "127.0.0.1:1"}).Output(ctx, document)
	if outcome != OutcomeUnknown || !errors.Is(err, context.Canceled) || errors.Is(err, errDriverTimedOut) {
		t.Fatalf("Output() = (%q, %v), want canceled unknown without timeout classification", outcome, err)
	}
}

func TestEscposTCPDriverSendsSharedEncoderBytesOverLoopback(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	document, err := BuildReceipt(testJob(), mustParseURL(t, "https://tickets.example.test"))
	if err != nil {
		t.Fatal(err)
	}
	want, err := EncodeReceipt(document)
	if err != nil {
		t.Fatal(err)
	}
	received := make(chan []byte, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			received <- nil
			return
		}
		defer connection.Close()
		data, _ := io.ReadAll(connection)
		received <- data
	}()

	driver := EscposTCPDriver{Address: listener.Addr().String()}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	outcome, err := driver.Output(ctx, document)
	if err != nil || outcome != OutcomePrinted {
		t.Fatalf("Output() = (%q, %v), want printed", outcome, err)
	}
	select {
	case got := <-received:
		if !bytes.Equal(got, want) {
			t.Errorf("TCP bytes differ from shared encoder output: got %d bytes, want %d", len(got), len(want))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("loopback printer did not receive output")
	}
}

func mustParseURL(t *testing.T, value string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}
