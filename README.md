# OTGF

**On-the-ground floor** — one chat link for local businesses, one floor to answer from.

## Flow

1. **Home** — quick setup (business name → chat space)
2. **Client link** — `/{slug}` — simple chat anyone can open
3. **Floor** — `/{slug}/floor` — inbox, thread, photo library

Share the client link in bios, texts, QR codes, receipts — wherever clients already look.

## Run

```bash
npm install
npm run dev
```

Chat tabs stay in sync over **SSE** (`/api/spaces/{slug}/events`). If the stream drops, the client falls back to 3s meta polls.

## Measure chat latency

Add `?latency=1` to any chat or floor URL (or run `localStorage.setItem('otgf-latency','1')`). A HUD shows:

- **paint** — send click → bubble visible (sender)
- **ack** — send click → server confirms
- **peer** — send click → other tab paints the message
- **payload** — last GET / PUT / meta sizes in KB

**Baseline / compare (use the deployed URL, not localhost):**

1. Open floor + customer chat for the same slug (two tabs), both with `?latency=1`.
2. Send ~10 text messages each direction.
3. Click **Copy summary** (or check `console.table`) and save p50/p95.
4. After sync changes, repeat on the same space and compare.

Targets after the latency fix: paint p95 &lt; 50ms, peer p95 &lt; ~600ms, meta polls &lt; 1KB when unchanged.

### Bench snapshot (same ~500KB space over Supabase, local Next → remote DB)

| Path | Request | Response | Wall |
|---|---|---|---|
| `GET ?meta=1` | — | ~40 B | ~0.6s RTT |
| `GET` full | — | ~489 KB | ~1.0s |
| `POST /messages` (new) | ~0.4 KB | ~0.3 KB | ~2.2s DB rewrite |
| Old `GET`+`PUT` full | ~489 KB | ~489 KB | ~2.3s |

Paint is optimistic (&lt;50ms). Peer lag is driven by **500ms meta polls** + one full GET when `updatedAt` changes — not by re-downloading the library every 2.5s.
