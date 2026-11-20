# Awareness × CoinMarketCap — a research agent with persistent memory

> Built for **Build with CMC: API Hackathon (Round 2)** — track: **AI Agents and Automation**.

**Demo:** [17s video](https://github.com/everest-an/awareness-cmc-agent/releases/download/demo-2026-11-20/cmc-demo-final.mp4) · **BUIDL:** [dorahacks.io/build/42551](https://dorahacks.io/build/42551) · **Post:** [x.com/everest_an/status/2123661636141494628](https://x.com/everest_an/status/2123661636141494628)

Most crypto assistants are stateless: every session starts from zero. This agent
gives CoinMarketCap data a **persistent, structured memory** through
[Awareness](https://awareness.market) — so the next session can recall what it
saw, when, and why it mattered.

```
CoinMarketCap API ──▶ agent ──▶ Awareness memory (write)
                          ▲                 │
                          └──── recall ◀────┘
```

## What it does

1. **Fetch** live quotes from the CoinMarketCap API.
2. **Write** a structured market brief (price, 24h/7d change, market cap, source,
   timestamp) into Awareness.
3. **Recall** prior briefs with natural-language queries in a later session —
   across process restarts and across tools.

The memory backend is pluggable:

| Mode | Setup | Use case |
|---|---|---|
| `cloud` | `AWARENESS_API_KEY` + `AWARENESS_MEMORY_ID` | team-shared, multi-device research memory |
| `local` | `npx @awareness.market/local start` | zero-account, data stays on the machine |

## Quick start

```bash
# 1) CMC API key (Startup tier from the hackathon; free Basic works too)
export CMC_API_KEY="your-coinmarketcap-api-key"

# 2a) Cloud memory
export AWARENESS_MODE=cloud
export AWARENESS_API_KEY="aw_..."
export AWARENESS_MEMORY_ID="your-memory-id"

# 2b) …or local memory (no account)
export AWARENESS_MODE=local
npx @awareness.market/local start

# 3) Fetch a brief and remember it
node agent.mjs brief BTC ETH SOL

# 4) In a new process/session, recall it
node agent.mjs recall "BTC market brief"
```

### Web demo (for the video)

```bash
npm start
# → http://127.0.0.1:37801
```

One page, two panels: **fetch + remember**, then **recall**. Restart the server,
reopen the page, and step 2 still returns the prior brief.

### CLI

```bash
node agent.mjs brief BTC ETH       # fetch + write
node agent.mjs recall BTC          # read back
node agent.mjs mode                # show active memory mode
```

## Why this is an agent, not a dashboard

- It **acts**: calls an external API, normalizes the result, writes a memory.
- It **persists**: the useful artifact is the memory, not the chart.
- It **plugs into any host**: Awareness exposes the same memory over REST/MCP, so
  Claude Code, Cursor, ChatGPT (MCP) or another agent can read the same research.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `CMC_API_KEY` | — | CoinMarketCap API key (`X-CMC_PRO_API_KEY`) |
| `CMC_BASE_URL` | official | override for a proxy/mock |
| `AWARENESS_MODE` | auto | `cloud` or `local` |
| `AWARENESS_API_KEY` | — | cloud `aw_` key |
| `AWARENESS_MEMORY_ID` | — | cloud memory space |
| `AWARENESS_BASE_URL` | `https://awareness.market` | cloud base |
| `AWARENESS_LOCAL_URL` | `http://127.0.0.1:37800` | local daemon |

No secrets are committed. `.env` is gitignored.

## Tests

```bash
npm test
```

Five L2 tests run the real modules against real local HTTP servers (mock CMC +
mock Awareness): quote normalization, cloud write payload/idempotency, cloud
recall, local daemon write+search, and result normalization.

## Notes from building on the CMC API

- The `quotes/latest` endpoint is the right primitive for an agent: one call,
  multiple symbols, USD quote nested under `quote.USD`.
- Keyless `/public-api` is excellent for a zero-setup first run, but the
  anonymous quota is small (error `1022`); the Startup tier removes that cliff.
- A `symbol=BTC,ETH` multi-symbol call is what makes a compact brief cheap;
  per-symbol calls would triple the credit spend for no gain.
- The agent stores the **rendered brief** rather than raw JSON: it is smaller,
  human-readable, and recallable by meaning instead of by field name.

## License

MIT
