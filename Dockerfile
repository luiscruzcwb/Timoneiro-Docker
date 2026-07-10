# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.25-alpine AS go-builder
RUN apk add --no-cache gcc musl-dev git
WORKDIR /app
COPY go.mod ./
COPY . .
COPY --from=frontend-builder /app/web/dist ./web/dist
ENV CGO_ENABLED=1 GOOS=linux GOFLAGS=-mod=mod
RUN go mod tidy && go build -ldflags="-s -w" -o /timoneiro ./cmd/timoneiro

# Stage 3: Final runtime image
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata curl

# Install Trivy for CVE scanning
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

COPY --from=go-builder /timoneiro /usr/local/bin/timoneiro
COPY --from=frontend-builder /app/web/dist /web/dist

WORKDIR /
EXPOSE 8080
VOLUME ["/data"]

ENV TIMONEIRO_DB_PATH=/data/timoneiro.db \
    TIMONEIRO_PORT=8080 \
    TIMONEIRO_CHECK_INTERVAL=300

ENTRYPOINT ["/usr/local/bin/timoneiro"]
