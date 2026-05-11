# Localtrack

A local-first time tracker built as a proof of concept for a browser-native architecture: no server, no authentication, no personal data leaving your machine.

## What this proves

Modern personal productivity tools are built as SaaS for business reasons, not technical ones. A time tracker has no need for a remote backend or a database living on someone else's server.

This project demonstrates that you can:
- Write a backend in Go, compile it to WASM, and ship it to the browser
- Store data persistently on the user's machine using OPFS
- Deliver the whole thing via a URL; no install required

## Stack

- **Go** backend logic, compiled to WASM
- **SQLite** via `ncruces/go-sqlite3`
- **OPFS VFS** via `danmestas/go-sqlite3-opfs`
- **Vanilla JS** frontend, no framework

## Status

Proof of concept. Not production ready.

The goal was to validate the architecture, not ship a product. Key limitations:

- No data export
- `danmestas/go-sqlite3-opfs` is an early-stage library with unclear maintenance status
- Error handling is minimal

## Running locally

```bash
cd backend
GOOS=js GOARCH=wasm go build -o ../main.wasm .
cd ..
cp $(go env GOROOT)/lib/wasm/wasm_exec.js .
# serve with any static file server
```

## Related

Blog post: [What if the browser was the server?](https://arthurcornil.com/blog/ship-it-to-the-user/)
