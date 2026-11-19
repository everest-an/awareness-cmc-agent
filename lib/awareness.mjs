/**
 * Awareness memory client.
 *
 * Two modes:
 *  - cloud (default when AWARENESS_API_KEY + AWARENESS_MEMORY_ID are set)
 *      POST /api/v1/memories/{id}/content   (write)
 *      POST /api/v1/memories/{id}/retrieve  (recall)
 *  - local (default when no cloud credentials)
 *      POST http://127.0.0.1:37800/api/v1/memories
 *      GET  http://127.0.0.1:37800/api/v1/memories/search?q=...
 *
 * Both are real Awareness surfaces; local needs no account.
 */

const CLOUD_DEFAULT = "https://awareness.market";
const LOCAL_DEFAULT = "http://127.0.0.1:37800";

function cloudBase() {
  return (process.env.AWARENESS_BASE_URL || CLOUD_DEFAULT).replace(/\/+$/, "");
}

function localBase() {
  return (process.env.AWARENESS_LOCAL_URL || LOCAL_DEFAULT).replace(/\/+$/, "");
}

export function mode() {
  if (process.env.AWARENESS_MODE === "local") return "local";
  if (process.env.AWARENESS_MODE === "cloud") return "cloud";
  return process.env.AWARENESS_API_KEY && process.env.AWARENESS_MEMORY_ID ? "cloud" : "local";
}

function cloudHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${process.env.AWARENESS_API_KEY}`,
  };
}

function localHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json" };
}

function cloudMemoryId() {
  const id = process.env.AWARENESS_MEMORY_ID;
  if (!id) throw new Error("AWARENESS_MEMORY_ID is required in cloud mode");
  return encodeURIComponent(id);
}

async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

/** Write one research note into Awareness. */
export async function remember({ content, title, metadata = {} }) {
  if (!content || !String(content).trim()) throw new Error("remember: content is required");

  if (mode() === "local") {
    const res = await fetch(`${localBase()}/api/v1/memories`, {
      method: "POST",
      headers: localHeaders(),
      body: JSON.stringify({
        content,
        title: title || "CMC market brief",
        source: "cmc_agent",
        agent_role: "external_agent",
        metadata: { source: "cmc_agent", ...metadata },
      }),
    });
    const body = await readJson(res);
    if (!res.ok) throw new Error(`Awareness local write failed: ${body?.error || res.status}`);
    return { ok: true, mode: "local", id: body?.id || null };
  }

  const messageId = `cmc:${cloudMemoryId()}:${crypto.randomUUID()}`;
  const res = await fetch(`${cloudBase()}/api/v1/memories/${cloudMemoryId()}/content`, {
    method: "POST",
    headers: cloudHeaders(),
    body: JSON.stringify({
      content,
      async_vectorize: true,
      message_id: messageId,
      kwargs: { source: "cmc_agent", ...metadata },
    }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`Awareness cloud write failed: ${body?.detail || body?.error || res.status}`);
  return { ok: true, mode: "cloud", id: body?.id || body?.delivery_id || messageId };
}

export function normalizeItems(data) {
  const raw = Array.isArray(data)
    ? data
    : (data?.results || data?.items || data?.cards || data?.entries || []);
  return raw.map((item, i) => {
    if (item == null) return null;
    if (typeof item === "string") return { id: `r${i}`, title: "", summary: item };
    const summary = item.summary ?? item.content ?? item.text ?? item.chunk ?? "";
    const title = item.title ?? item.name ?? item.card_title ?? "";
    if (!summary && !title) return null;
    return {
      id: String(item.id ?? item.card_id ?? `r${i}`),
      title: String(title || ""),
      summary: typeof summary === "string" ? summary : JSON.stringify(summary),
      createdAt: item.created_at ?? item.updated_at ?? item.timestamp ?? "",
    };
  }).filter(Boolean);
}

/** Recall notes relevant to a query. */
export async function recall(query, { limit = 5 } = {}) {
  if (!query || !String(query).trim()) throw new Error("recall: query is required");

  if (mode() === "local") {
    const params = new URLSearchParams({ q: String(query), limit: String(limit) });
    const res = await fetch(`${localBase()}/api/v1/memories/search?${params}`);
    const body = await readJson(res);
    if (!res.ok) throw new Error(`Awareness local recall failed: ${body?.error || res.status}`);
    return { ok: true, mode: "local", items: normalizeItems(body).slice(0, limit) };
  }

  const res = await fetch(`${cloudBase()}/api/v1/memories/${cloudMemoryId()}/retrieve`, {
    method: "POST",
    headers: cloudHeaders(),
    body: JSON.stringify({
      query: String(query).slice(0, 2000),
      recall_mode: "structured",
      include_raw_chunks: false,
    }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(`Awareness cloud recall failed: ${body?.detail || body?.error || res.status}`);
  return { ok: true, mode: "cloud", items: normalizeItems(body).slice(0, limit) };
}
