#!/usr/bin/env node
/**
 * CLI demo:
 *   node agent.mjs brief BTC ETH SOL
 *   node agent.mjs recall BTC
 *
 * `brief` fetches live CoinMarketCap data, prints a brief, and stores that
 * brief in Awareness. `recall` reads prior briefs back from Awareness — the
 * cross-session memory that a stateless market bot does not have.
 */
import { fetchQuotes, formatBrief } from "./lib/cmc.mjs";
import { remember, recall, mode } from "./lib/awareness.mjs";

function usage() {
  console.log(`Awareness × CoinMarketCap research agent

Usage:
  node agent.mjs brief <SYMBOL...>   fetch live CMC quotes + remember the brief
  node agent.mjs recall <query>      recall prior research from Awareness
  node agent.mjs mode                show the active memory mode

Env:
  CMC_API_KEY            CoinMarketCap API key (hackathon Startup tier)
  AWARENESS_API_KEY      cloud mode: aw_... key
  AWARENESS_MEMORY_ID    cloud mode: memory id
  AWARENESS_MODE         cloud | local (default: cloud if key+id, else local)
  AWARENESS_LOCAL_URL    local daemon (default http://127.0.0.1:37800)
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help") { usage(); return; }

  if (command === "mode") {
    console.log(`memory mode: ${mode()}`);
    return;
  }

  if (command === "brief") {
    const symbols = args.length ? args : ["BTC", "ETH"];
    const quotes = await fetchQuotes(symbols);
    const content = formatBrief(quotes);
    const saved = await remember({
      content,
      title: `CMC brief: ${quotes.map((q) => q.symbol).join(" ")}`,
      metadata: { tool: "cmc-quotes", symbols: quotes.map((q) => q.symbol) },
    });
    console.log(content);
    console.log(`\nRemembered in Awareness (${saved.mode}) → ${saved.id || "ok"}`);
    return;
  }

  if (command === "recall") {
    const query = args.join(" ").trim() || "market brief";
    const out = await recall(query);
    console.log(`Recalled ${out.items.length} item(s) from Awareness (${out.mode}) for "${query}":\n`);
    for (const [i, item] of out.items.entries()) {
      console.log(`### ${i + 1}. ${item.title || "Untitled"}`);
      console.log(item.summary.slice(0, 800));
      console.log("");
    }
    if (!out.items.length) console.log("(no prior memory yet — run `brief` twice to see the difference)");
    return;
  }

  usage();
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exitCode = 1;
});
