# Postman collection

`rag-chatbot.postman_collection.json` + `rag-chatbot.postman_environment.json`,
built from the real OpenAPI spec (`backend/app/main.py`'s 7 live endpoints)
and **verified end-to-end against the actual docker-compose stack** via
`newman` — 9/9 requests, 5/5 assertions, 0 failures (login → upload → list/get
document → chat → sessions → messages).

## Use it

1. `cd infra && docker compose up -d` (see [`../docs/SETUP.md`](../docs/SETUP.md))
2. Import both files into Postman (or run headlessly: `npx newman run
   rag-chatbot.postman_collection.json -e rag-chatbot.postman_environment.json`)
3. Run **Auth > Get Token** first — every other request depends on
   `{{access_token}}`, set automatically by its test script.
4. **Documents > Upload Document** needs a file attached to the `file` form
   field (Postman won't let you send it otherwise). Sets `{{document_id}}`.
5. **Chat > Send Message** sets `{{session_id}}` from the SSE response. Needs
   `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` set in `infra/.env` to get a real
   reply — without one you'll see `event: error`, which is expected (every
   other part of the flow — auth, persistence — still works, see the
   request's own description).

Postman buffers SSE responses into one body rather than rendering tokens live
— that's a Postman UI limitation, not a bug in the API.

## Environments

The included environment targets docker-compose (`localhost:8000`/`:8080`).
For the Helm chart's Ingress instead, override `base_url` to
`http://rag-chatbot.local/api/v1` and `keycloak_url` to
`http://keycloak.rag-chatbot.local` — see
[`../infra/helm/README.md`](../infra/helm/README.md).
