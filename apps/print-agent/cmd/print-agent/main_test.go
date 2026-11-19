package main

import (
	"bytes"
	"testing"
)

func TestVersionFlagPrintsBuildInfo(t *testing.T) {
	previousVersion, previousCommit := version, commit
	version, commit = "1.2.3-rc.1+build.7", "0123456789abcdef0123456789abcdef01234567"
	t.Cleanup(func() {
		version, commit = previousVersion, previousCommit
	})

	var output bytes.Buffer
	handled, err := printVersion([]string{"--version"}, &output)
	if err != nil {
		t.Fatalf("printVersion() error = %v", err)
	}
	if !handled {
		t.Fatal("printVersion() did not handle --version")
	}
	if got, want := output.String(), "print-agent 1.2.3-rc.1+build.7 (commit 0123456789abcdef0123456789abcdef01234567)\n"; got != want {
		t.Fatalf("printVersion() = %q, want %q", got, want)
	}
}
