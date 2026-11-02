package printagent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const maxResponseBytes = 64 << 10

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type JobPayload struct {
	TicketNumber int       `json:"ticketNumber"`
	PartySize    int       `json:"partySize"`
	PublicToken  string    `json:"publicToken"`
	IssuedAt     time.Time `json:"issuedAt"`
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
	baseURL *url.URL
	token   string
	http    *http.Client
}

func NewAPIClient(config Config) *APIClient {
	return &APIClient{
		baseURL: config.APIBaseURL,
		token:   config.AgentToken,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *APIClient) Claim(ctx context.Context) (*PrintJob, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint("/api/agent/print-jobs/claim"), nil)
	if err != nil {
		return nil, fmt.Errorf("create claim request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.token)

	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("claim print job: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("claim print job: unexpected HTTP status %d", response.StatusCode)
	}

	var body struct {
		Job *PrintJob `json:"job"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode claim response: %w", err)
	}
	if body.Job == nil || !uuidPattern.MatchString(body.Job.ID) || !uuidPattern.MatchString(body.Job.TicketID) || body.Job.Status != "printing" || body.Job.Attempt < 1 || body.Job.LeaseToken == "" {
		return nil, fmt.Errorf("claim response contains an invalid print job")
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

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint("/api/agent/print-jobs/"+url.PathEscape(job.ID)+"/result"), bytes.NewReader(body))
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
