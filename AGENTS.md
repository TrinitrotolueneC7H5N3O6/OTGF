<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 (Turbopack) app named `otgf`. Uses Prisma with a local SQLite DB and an optional OpenRouter integration for the AI "Assist" feature.

### Services / commands
- Dev server: `npm run dev` — serves on `http://localhost:3010` (host `localhost`). This is the only long-running service. Standard scripts live in `package.json` (`lint`, `build`, `db:push`, `db:studio`).
- Lint: `npm run lint`. Note the repo currently has pre-existing lint errors/warnings unrelated to environment setup; a clean exit is not expected.

### Non-obvious gotchas
- `DATABASE_URL` is required. Fresh checkouts get it from `.env.example` via the environment `install` script (`DATABASE_URL="file:./dev.db"`). If DB calls fail with a missing datasource URL, ensure `.env` exists.
- The committed Prisma migration under `prisma/migrations/` is stale (only creates `Space`) and does not match `schema.prisma` (which also has `User`, `Session`, `Feedback`). Use `npm run db:push` to sync the schema, NOT `prisma migrate`.
- The AI Assist endpoint (`/api/ai/suggest`) needs `OPENROUTER_API_KEY` in `.env`; without it that endpoint returns HTTP 500 but the rest of the app (create space, client chat, floor inbox) works fully. Core chat does not require any external API key.
- Core flow to smoke-test: home page → enter business name → "Create chat space" → sign up owner account → open client link `/{slug}` and send a message (persists into the `Space.data` JSON). Verify persisted state via `GET /api/spaces/{slug}`.
