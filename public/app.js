const $ = (id) => document.getElementById(id);

function setState(el, text, kind = "") {
  el.textContent = text;
  el.className = `state ${kind}`.trim();
}

function fmtUsd(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(6)}`;
}

function pct(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctClass(n) {
  if (n == null) return "";
  return Number(n) >= 0 ? "up" : "down";
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    $("mode").textContent = `memory: ${cfg.memoryMode} · cmc: ${cfg.hasCmcKey ? "key" : "anonymous"}`;
  } catch {
    $("mode").textContent = "offline";
  }
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function onBrief() {
  const btn = $("brief-btn");
  const symbols = $("symbols").value.split(",").map((s) => s.trim()).filter(Boolean);
  btn.disabled = true;
  setState($("brief-state"), "Fetching CoinMarketCap + writing to Awareness…");
  try {
    const data = await post("/api/brief", { symbols });
    const rows = data.quotes.map((q) => `
      <tr>
        <td><strong>${q.symbol}</strong><span class="name">${q.name || ""}</span></td>
        <td class="num">${fmtUsd(q.price)}</td>
        <td class="num ${pctClass(q.change24h)}">${pct(q.change24h)}</td>
        <td class="num ${pctClass(q.change7d)}">${pct(q.change7d)}</td>
        <td class="num">${fmtUsd(q.marketCap)}</td>
      </tr>`).join("");
    $("brief").innerHTML = `
      <table>
        <thead><tr><th>Token</th><th>Price</th><th>24h</th><th>7d</th><th>Market cap</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    setState(
      $("brief-state"),
      `Remembered in Awareness (${data.saved.mode}) · ${new Date().toLocaleTimeString()}`,
      "ok"
    );
  } catch (err) {
    setState($("brief-state"), err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function onRecall() {
  const btn = $("recall-btn");
  const query = $("query").value.trim();
  btn.disabled = true;
  setState($("recall-state"), "Searching Awareness memory…");
  try {
    const data = await post("/api/recall", { query });
    if (!data.items.length) {
      $("recall").innerHTML = "";
      setState($("recall-state"), "No prior memory yet — run step 1 first.", "warn");
      return;
    }
    $("recall").innerHTML = data.items.map((item, i) => `
      <article class="memory">
        <div class="memory-head">
          <span class="memory-index">${i + 1}</span>
          <h3>${item.title || "Untitled memory"}</h3>
        </div>
        <pre>${item.summary.slice(0, 700)}</pre>
      </article>`).join("");
    setState($("recall-state"), `Recalled ${data.items.length} item(s) from Awareness (${data.mode})`, "ok");
  } catch (err) {
    setState($("recall-state"), err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

$("brief-btn").addEventListener("click", onBrief);
$("recall-btn").addEventListener("click", onRecall);
$("symbols").addEventListener("keydown", (e) => { if (e.key === "Enter") onBrief(); });
$("query").addEventListener("keydown", (e) => { if (e.key === "Enter") onRecall(); });
loadConfig();
