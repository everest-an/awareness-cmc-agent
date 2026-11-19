/**
 * L2 tests: real modules, real HTTP, mock external services only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fetchQuotes, formatBrief } from "./lib/cmc.mjs";
import { remember, recall, normalizeItems } from "./lib/awareness.mjs";

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((r) => {
          server.closeAllConnections?.();
          server.close(r);
        }),
      });
    });
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => resolve(raw));
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const CMC_BODY = {
  data: [
    { id: 1, name: "Bitcoin", symbol: "BTC", cmc_rank: 1, quote: { USD: { price: 90000, percent_change_24h: 1.5, percent_change_7d: -2.1, market_cap: 1.8e12, volume_24h: 5e10, last_updated: "2026-11-19T00:00:00Z" } } },
    { id: 1027, name: "Ethereum", symbol: "ETH", cmc_rank: 2, quote: { USD: { price: 3000, percent_change_24h: -0.8, percent_change_7d: 4.2, market_cap: 3.6e11, volume_24h: 2e10, last_updated: "2026-11-19T00:00:00Z" } } },
  ],
};

test("fetchQuotes normalizes a real CMC-shaped response", async () => {
  const srv = await startServer(async (req, res) => {
    assert.match(req.url, /\/cryptocurrency\/quotes\/latest\?symbol=BTC,ETH/);
    json(res, 200, CMC_BODY);
  });
  process.env.CMC_BASE_URL = srv.url;
  try {
    const quotes = await fetchQuotes(["btc", "ETH"]);
    assert.equal(quotes.length, 2);
    assert.equal(quotes[0].symbol, "BTC");
    assert.equal(quotes[0].price, 90000);
    assert.equal(quotes[1].change24h, -0.8);
    const brief = formatBrief(quotes, { now: new Date("2026-11-19T12:00:00Z") });
    assert.match(brief, /CoinMarketCap brief/);
    assert.match(brief, /\| BTC \|/);
    assert.match(brief, /\+1\.50%/);
  } finally {
    delete process.env.CMC_BASE_URL;
    await srv.stop();
  }
});

test("cloud remember writes the brief with an idempotency id", async () => {
  let seen = null;
  const srv = await startServer(async (req, res) => {
    seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(await readBody(req)) };
    json(res, 201, { status: "success" });
  });
  process.env.AWARENESS_MODE = "cloud";
  process.env.AWARENESS_BASE_URL = srv.url;
  process.env.AWARENESS_API_KEY = "aw_test";
  process.env.AWARENESS_MEMORY_ID = "mem_1";
  try {
    const out = await remember({ content: "BTC brief", title: "t", metadata: { symbols: ["BTC"] } });
    assert.equal(out.ok, true);
    assert.equal(seen.url, "/api/v1/memories/mem_1/content");
    assert.equal(seen.auth, "Bearer aw_test");
    assert.equal(seen.body.content, "BTC brief");
    assert.match(seen.body.message_id, /^cmc:mem_1:/);
    assert.equal(seen.body.kwargs.source, "cmc_agent");
  } finally {
    delete process.env.AWARENESS_MODE;
    delete process.env.AWARENESS_BASE_URL;
    delete process.env.AWARENESS_API_KEY;
    delete process.env.AWARENESS_MEMORY_ID;
    await srv.stop();
  }
});

test("cloud recall parses structured results", async () => {
  const srv = await startServer(async (req, res) => {
    assert.match(req.url, /\/memories\/mem_1\/retrieve$/);
    json(res, 200, { results: [{ title: "BTC brief", content: "Price was 90k" }] });
  });
  process.env.AWARENESS_MODE = "cloud";
  process.env.AWARENESS_BASE_URL = srv.url;
  process.env.AWARENESS_API_KEY = "aw_test";
  process.env.AWARENESS_MEMORY_ID = "mem_1";
  try {
    const out = await recall("BTC");
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].title, "BTC brief");
    assert.match(out.items[0].summary, /90k/);
  } finally {
    delete process.env.AWARENESS_MODE;
    delete process.env.AWARENESS_BASE_URL;
    delete process.env.AWARENESS_API_KEY;
    delete process.env.AWARENESS_MEMORY_ID;
    await srv.stop();
  }
});

test("local mode uses the daemon write + search endpoints", async () => {
  const urls = [];
  const srv = await startServer(async (req, res) => {
    urls.push(`${req.method} ${req.url}`);
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      assert.equal(body.source, "cmc_agent");
      return json(res, 200, { status: "ok", id: "mem_1" });
    }
    return json(res, 200, { items: [{ id: "m1", title: "BTC", summary: "old note" }] });
  });
  process.env.AWARENESS_MODE = "local";
  process.env.AWARENESS_LOCAL_URL = srv.url;
  try {
    const saved = await remember({ content: "note", title: "BTC" });
    assert.equal(saved.mode, "local");
    const out = await recall("BTC");
    assert.equal(out.items.length, 1);
    assert.equal(urls[0], "POST /api/v1/memories");
    assert.match(urls[1], /^GET \/api\/v1\/memories\/search\?q=BTC/);
  } finally {
    delete process.env.AWARENESS_MODE;
    delete process.env.AWARENESS_LOCAL_URL;
    await srv.stop();
  }
});

test("normalizeItems tolerates arrays, results, and strings", () => {
  assert.equal(normalizeItems({ results: ["a", { title: "T", summary: "S" }, null] }).length, 2);
  assert.equal(normalizeItems([{ title: "T", content: "C" }])[0].summary, "C");
  assert.equal(normalizeItems({ items: [{ name: "N", text: "X" }] })[0].title, "N");
});
