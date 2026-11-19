#!/usr/bin/env node
/**
 * Web demo for the video: one page, two actions.
 *   1. Fetch live CMC quotes and remember the brief in Awareness.
 *   2. Recall prior briefs from Awareness (works after a restart).
 *
 * Run: npm start  → http://127.0.0.1:37801
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchQuotes, formatBrief } from "./lib/cmc.mjs";
import { remember, recall, mode } from "./lib/awareness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 37801);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("invalid JSON")); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, {
        memoryMode: mode(),
        hasCmcKey: Boolean(process.env.CMC_API_KEY),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/brief") {
      const body = await readBody(req);
      const symbols = (body.symbols || ["BTC", "ETH", "SOL"]).map((s) => String(s).trim()).filter(Boolean);
      if (!symbols.length) return json(res, 400, { error: "at least one symbol is required" });

      const quotes = await fetchQuotes(symbols);
      const content = formatBrief(quotes);
      const saved = await remember({
        content,
        title: `CMC brief: ${quotes.map((q) => q.symbol).join(" ")}`,
        metadata: { tool: "cmc-quotes", symbols: quotes.map((q) => q.symbol) },
      });
      return json(res, 200, { quotes, content, saved });
    }

    if (req.method === "POST" && url.pathname === "/api/recall") {
      const body = await readBody(req);
      const query = String(body.query || "").trim();
      if (!query) return json(res, 400, { error: "query is required" });
      const out = await recall(query);
      return json(res, 200, out);
    }

    if (req.method === "GET") {
      const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return json(res, 404, { error: "not found" });
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      return res.end(fs.readFileSync(file));
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Awareness × CMC demo → http://127.0.0.1:${PORT}`);
  console.log(`memory mode: ${mode()}${process.env.CMC_API_KEY ? "" : " · no CMC_API_KEY (anonymous quota)"}`);
});
