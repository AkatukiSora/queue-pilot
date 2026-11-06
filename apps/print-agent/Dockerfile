FROM golang:1.27.3-trixie@sha256:c65ecfe613b539ac74c62a4c3b2c27e8f8a6076384c8f27e8a3c0f3be17cc385 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -buildvcs=false -o /out/print-agent ./cmd/print-agent

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39
COPY --from=build /out/print-agent /print-agent
COPY entrypoint.mjs /entrypoint.mjs
USER 65532:65532
ENTRYPOINT ["node", "/entrypoint.mjs"]
