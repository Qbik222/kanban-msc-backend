# API Documentation Guide

This backend uses two documentation sources:

- Swagger for HTTP REST endpoints
- AsyncAPI for Socket.IO events

## 1) Swagger (HTTP API)

- URL: [http://localhost:3000/api](http://localhost:3000/api)
- Covers: REST endpoints, request DTOs, response DTOs, auth requirements.
- Use it when you need to test endpoints like `POST /boards`, `PATCH /boards/:id`, `DELETE /boards/:id`, `POST /columns`, `PATCH /columns/reorder`, `PATCH /columns/:id`, `DELETE /columns/:id`, `POST /cards`, `PATCH /cards/:id`, `PATCH /cards/:id/move`, `POST /cards/:id/comments`, `DELETE /cards/:id/comments/:commentId`.

## 2) AsyncAPI (WebSocket / Socket.IO)

- Spec file: [`asyncapi.yaml`](./asyncapi.yaml)
- Covers:
  - client event: `joinBoard` with payload `{ "boardId": "..." }`
  - server events: `board:joined`, `board:updated`, `board:deleted`, `columns:updated`, `card_created`, `card_updated`, `card_moved`, `comment_added`
  - event payload schemas and descriptions

## 3) Typical workflow

1. Open Swagger and make sure board endpoints work over HTTP.
2. Open `asyncapi.yaml` to see Socket.IO event contracts.
3. Connect Socket.IO client to `http://localhost:3000`. **In Postman, use New → Socket.IO** (not raw WebSocket).
4. Emit `joinBoard` with the target `boardId`. Listen for `board:joined` as confirmation.
5. Trigger `PATCH /boards/:id`, `DELETE /boards/:id`, or column/card operations in Swagger/Postman.
6. Verify `board:updated`, `board:deleted`, `columns:updated`, `card_created`, `card_updated`, `card_moved`, or `comment_added` events are received.

## 4) Optional: render AsyncAPI HTML docs

From backend root (PowerShell):

```powershell
npm run docs:asyncapi
```

Then open:

- `./asyncapi-docs/index.html`

Equivalent one-off command (without script):

```powershell
npx @asyncapi/cli generate fromTemplate asyncapi.yaml @asyncapi/html-template -o .\asyncapi-docs --force-write
```

## Quick links

- Swagger UI: [http://localhost:3000/api](http://localhost:3000/api)
- AsyncAPI spec: [`asyncapi.yaml`](./asyncapi.yaml)
