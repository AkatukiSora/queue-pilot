package printagent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	_ "time/tzdata"
)

const maxResponseBytes = 64 << 10

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

const slotPayloadKind = "slot"

var ErrIncompatibleAgent = errors.New("server rejected all print payload versions supported by this agent")

type Reservation struct {
	Kind     string    `json:"kind"`
	StartsAt time.Time `json:"startsAt,omitempty"`
}

type ReceiptCopy struct {
	ReceiptTitle    string `json:"receiptTitle"`
	ArrivalGuidance string `json:"arrivalGuidance"`
}

type JobPayload struct {
	SchemaVersion int         `json:"schemaVersion,omitempty"`
	Kind          string      `json:"kind,omitempty"`
	TicketNumber  int         `json:"ticketNumber"`
	PartySize     int         `json:"partySize,omitempty"`
	SlotStartsAt  time.Time   `json:"slotStartsAt,omitempty"`
	PublicToken   string      `json:"publicToken,omitempty"`
	IssuedAt      time.Time   `json:"issuedAt"`
	Reservation   Reservation `json:"reservation,omitempty"`
	TimeZone      string      `json:"timeZone,omitempty"`
	PublicURL     string      `json:"publicURL,omitempty"`
	Copy          ReceiptCopy `json:"copy,omitempty"`
}

func (p JobPayload) validate() error {
	if p.TicketNumber < 1 {
		return fmt.Errorf("ticket number must be positive")
	}
	if p.IssuedAt.IsZero() {
		return fmt.Errorf("issuedAt is required")
	}

	if p.SchemaVersion == 2 {
		if p.Kind != "" || p.PartySize != 0 || !p.SlotStartsAt.IsZero() || p.PublicToken != "" {
			return fmt.Errorf("version 2 payload contains legacy fields")
		}
		switch p.Reservation.Kind {
		case "legacy":
			if !p.Reservation.StartsAt.IsZero() {
				return fmt.Errorf("legacy reservation must not have a start time")
			}
		case slotPayloadKind:
			if p.Reservation.StartsAt.IsZero() {
				return fmt.Errorf("slot reservation requires a start time")
			}
		default:
			return fmt.Errorf("unsupported reservation kind %q", p.Reservation.Kind)
		}
		if p.TimeZone == "" || p.PublicURL == "" || p.Copy.ReceiptTitle == "" || p.Copy.ArrivalGuidance == "" {
			return fmt.Errorf("version 2 receipt snapshot is incomplete")
		}
		if p.TimeZone == "Local" {
			return fmt.Errorf("receipt timezone must be an IANA location, not Local")
		}
		if _, err := time.LoadLocation(p.TimeZone); err != nil {
			return fmt.Errorf("invalid receipt timezone: %w", err)
		}
		publicURL, err := url.Parse(p.PublicURL)
		if err != nil || (publicURL.Scheme != "http" && publicURL.Scheme != "https") || publicURL.Host == "" || publicURL.User != nil || publicURL.RawQuery != "" || publicURL.Fragment != "" || !strings.HasPrefix(publicURL.Path, "/ticket/") {
			return fmt.Errorf("publicURL must be an absolute ticket URL without credentials, query, or fragment")
		}
		tokenPath := strings.TrimPrefix(publicURL.Path, "/ticket/")
		if tokenPath == "" || strings.Contains(tokenPath, "/") || tokenPath == "." || tokenPath == ".." {
			return fmt.Errorf("publicURL must contain exactly one ticket path segment")
		}
		if !plainReceiptText(p.Copy.ReceiptTitle) || !plainReceiptText(p.Copy.ArrivalGuidance) {
			return fmt.Errorf("receipt copy must be plain text")
		}
		return nil
	}
	if p.SchemaVersion != 0 || p.Reservation != (Reservation{}) || p.TimeZone != "" || p.PublicURL != "" || p.Copy != (ReceiptCopy{}) {
		return fmt.Errorf("legacy payload contains version 2 fields")
	}
	if p.PublicToken == "" {
		return fmt.Errorf("public token is required")
	}

	switch p.Kind {
	case "": // Legacy payloads have no kind and retain partySize.
		if p.PartySize < 1 || p.PartySize > 20 || !p.SlotStartsAt.IsZero() {
			return fmt.Errorf("legacy payload is invalid")
		}
	case slotPayloadKind:
		if p.PartySize != 0 || p.SlotStartsAt.IsZero() || p.SlotStartsAt.Second() != 0 || p.SlotStartsAt.Nanosecond() != 0 {
			return fmt.Errorf("slot payload is invalid")
		}
	default:
		return fmt.Errorf("unsupported print payload kind %q", p.Kind)
	}
	return nil
}

type PrintJob struct {
	ID         string     `json:"id"`
	TicketID   string     `json:"ticketId"`
	Status     string     `json:"status"`
	Attempt    int        `json:"attempt"`
	LeaseToken string     `json:"leaseToken"`
	Payload    JobPayload `json:"payload"`
}

type Outcome string

const (
	OutcomePrinted Outcome = "printed"
	OutcomeFailed  Outcome = "failed"
	OutcomeUnknown Outcome = "unknown"
)

type APIClient struct {
	baseURL     *url.URL
	token       string
	wireVersion int
	http        *http.Client
}

func NewAPIClient(config Config) *APIClient {
	return &APIClient{
		baseURL:     config.APIBaseURL,
		token:       config.AgentToken,
		wireVersion: config.WireVersion,
		http:        &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *APIClient) Claim(ctx context.Context) (*PrintJob, error) {
	path := "/api/agent/print-jobs/claim"
	var requestBody io.Reader
	if c.wireVersion == 2 {
		path = "/api/v3/agent/print-jobs/claim"
		body, err := json.Marshal(struct {
			AcceptedPayloadVersions []int `json:"acceptedPayloadVersions"`
		}{AcceptedPayloadVersions: []int{2}})
		if err != nil {
			return nil, fmt.Errorf("encode claim request: %w", err)
		}
		requestBody = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(path), requestBody)
	if err != nil {
		return nil, fmt.Errorf("create claim request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	if c.wireVersion == 2 {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("claim print job: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	if c.wireVersion == 2 && response.StatusCode == http.StatusConflict {
		return nil, fmt.Errorf("%w: claim rejected with HTTP 409", ErrIncompatibleAgent)
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("claim print job: unexpected HTTP status %d", response.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read claim response: %w", err)
	}
	if len(data) > maxResponseBytes {
		return nil, fmt.Errorf("claim response exceeds %d bytes", maxResponseBytes)
	}
	var body struct {
		Job *PrintJob `json:"job"`
	}
	if err := decodeStrictJSON(data, &body); err != nil {
		return nil, fmt.Errorf("decode claim response: %w", err)
	}
	if body.Job == nil || !uuidPattern.MatchString(body.Job.ID) || !uuidPattern.MatchString(body.Job.TicketID) || body.Job.Status != "printing" || body.Job.Attempt < 1 || body.Job.LeaseToken == "" {
		return nil, fmt.Errorf("claim response contains an invalid print job")
	}
	if err := body.Job.Payload.validate(); err != nil {
		return nil, fmt.Errorf("claim response contains an invalid payload: %w", err)
	}
	if (c.wireVersion == 2 && body.Job.Payload.SchemaVersion != 2) || (c.wireVersion != 2 && body.Job.Payload.SchemaVersion != 0) {
		return nil, fmt.Errorf("claim response payload version does not match this agent")
	}
	return body.Job, nil
}

func (c *APIClient) ReportResult(ctx context.Context, job PrintJob, outcome Outcome, detail string) error {
	body, err := json.Marshal(struct {
		LeaseToken string  `json:"leaseToken"`
		Outcome    Outcome `json:"outcome"`
		Detail     string  `json:"detail,omitempty"`
	}{LeaseToken: job.LeaseToken, Outcome: outcome, Detail: truncateDetail(detail, 500)})
	if err != nil {
		return fmt.Errorf("encode print result: %w", err)
	}

	resultPath := "/api/agent/print-jobs/" + url.PathEscape(job.ID) + "/result"
	if c.wireVersion == 2 {
		resultPath = "/api/v3/agent/print-jobs/" + url.PathEscape(job.ID) + "/result"
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(resultPath), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create result request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("report print result: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("report print result: unexpected HTTP status %d", response.StatusCode)
	}

	var result struct {
		Job struct {
			Status string `json:"status"`
		} `json:"job"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(&result); err != nil {
		return fmt.Errorf("decode print result response: %w", err)
	}
	if result.Job.Status != string(outcome) {
		return fmt.Errorf("print result response status %q does not match reported outcome", result.Job.Status)
	}
	return nil
}

func (c *APIClient) endpoint(path string) string {
	endpoint := *c.baseURL
	endpoint.Path = path
	endpoint.RawPath = ""
	return endpoint.String()
}

func truncateDetail(detail string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	if len([]rune(detail)) <= maxRunes {
		return detail
	}
	return strings.TrimSpace(string([]rune(detail)[:maxRunes]))
}
