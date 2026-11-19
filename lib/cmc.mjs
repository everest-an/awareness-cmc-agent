/**
 * CoinMarketCap client.
 *
 * Two transports:
 *  - Pro API  (`CMC_API_KEY` set): https://pro-api.coinmarketcap.com/v1
 *  - Keyless public API (no key):  https://pro-api.coinmarketcap.com/public-api/v3
 *
 * The keyless route is heavily rate-limited (anonymous access). A real demo
 * should set CMC_API_KEY to the hackathon's Startup-tier key.
 */

const PRO_BASE = "https://pro-api.coinmarketcap.com/v1";
const PUBLIC_BASE = "https://pro-api.coinmarketcap.com/public-api/v3";

function baseUrl() {
  if (process.env.CMC_BASE_URL) return process.env.CMC_BASE_URL.replace(/\/+$/, "");
  return process.env.CMC_API_KEY ? PRO_BASE : PUBLIC_BASE;
}

function headers() {
  const out = { Accept: "application/json" };
  if (process.env.CMC_API_KEY) out["X-CMC_PRO_API_KEY"] = process.env.CMC_API_KEY;
  return out;
}

async function getJson(url) {
  const res = await fetch(url, { headers: headers() });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const message = body?.status?.error_message || `HTTP ${res.status}`;
    const code = body?.status?.error_code;
    const hint = code === 1022
      ? " Anonymous keyless quota exhausted — set CMC_API_KEY to your CoinMarketCap API key."
      : "";
    throw new Error(`CoinMarketCap: ${message} (code ${code ?? res.status}).${hint}`);
  }
  return body;
}

/** Normalize one CMC token object (quotes or listings shape). */
export function normalizeQuote(token) {
  const usd = (token.quote?.USD) || (Array.isArray(token.quote) ? token.quote.find((q) => q.symbol === "USD") : null) || {};
  return {
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    rank: token.cmc_rank ?? token.rank ?? null,
    price: usd.price ?? null,
    change1h: usd.percent_change_1h ?? null,
    change24h: usd.percent_change_24h ?? null,
    change7d: usd.percent_change_7d ?? null,
    marketCap: usd.market_cap ?? null,
    volume24h: usd.volume_24h ?? null,
    lastUpdated: usd.last_updated || token.last_updated || null,
  };
}

/**
 * Fetch latest quotes for symbols.
 * @param {string[]} symbols e.g. ["BTC", "ETH"]
 * @returns {Promise<object[]>}
 */
export async function fetchQuotes(symbols) {
  const list = (symbols || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  if (!list.length) throw new Error("fetchQuotes: at least one symbol is required");

  const url = `${baseUrl()}/cryptocurrency/quotes/latest?symbol=${list.join(",")}&convert=USD`;
  const body = await getJson(url);

  // Pro returns `data` keyed by symbol; public-api may return an array.
  const data = body?.data;
  const arr = Array.isArray(data)
    ? data
    : Object.values(data || {});
  return arr.map(normalizeQuote);
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "n/a";
  const v = Number(n);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(6)}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "n/a";
  const v = Number(n);
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Render a markdown brief that is also stored in Awareness. */
export function formatBrief(quotes, { now = new Date() } = {}) {
  const stamp = now.toISOString();
  const rows = quotes.map((q) =>
    `| ${q.symbol} | ${fmtUsd(q.price)} | ${fmtPct(q.change24h)} | ${fmtPct(q.change7d)} | ${fmtUsd(q.marketCap)} |`
  ).join("\n");
  return [
    `## CoinMarketCap brief — ${stamp.slice(0, 16).replace("T", " ")} UTC`,
    "",
    "| Token | Price | 24h | 7d | Market cap |",
    "|---|---:|---:|---:|---:|",
    rows,
    "",
    "Source: CoinMarketCap API. Stored in Awareness so the next session can recall this view.",
  ].join("\n");
}
