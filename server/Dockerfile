FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/goprofile ./cmd/goprofile

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/goprofile /goprofile
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/goprofile"]
