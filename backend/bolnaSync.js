const fetch = require("node-fetch");
const { getAll, getOne, run } = require("./db");
const { applyScreeningData } = require("./screeningUpdate");

function normalizeBolnaApiKey(raw) {
  if (!raw || typeof raw !== "string") return "";
  let t = raw.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t;
}

/** When Bolna marks this, post-call extraction is usually included in the same payload. */
const STATUS_SCREENED = new Set(["completed", "stopped"]);

const FAILURE_TERMINAL = new Set([
  "failed",
  "no-answer",
  "busy",
  "canceled",
  "error",
  "balance-low",
]);

/** Still on the call leg — never persist screening yet. */
const STATUS_ON_CALL = new Set([
  "scheduled",
  "queued",
  "rescheduled",
  "initiated",
  "ringing",
  "in-progress",
]);

/**
 * Bolna often returns full `extracted_data` while `status` / `smart_status` is still
 * `call-disconnected`; `completed` may arrive later. If the extraction object is non-empty,
 * we treat the run as screenable immediately.
 */
function hasUsableExtraction(ex) {
  let data = ex.extracted_data;
  if (data == null) return false;
  if (typeof data === "string") {
    const t = data.trim();
    if (!t) return false;
    try {
      data = JSON.parse(t);
    } catch {
      return false;
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  return Object.keys(data).length > 0;
}

function normalizeExecutionPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const d = raw.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.status != null || d.id != null || d.transcript != null || d.extracted_data != null) {
      return d;
    }
  }
  if (raw.execution && typeof raw.execution === "object") return raw.execution;
  if (
    raw.status != null ||
    raw.id != null ||
    raw.transcript != null ||
    raw.extracted_data != null
  ) {
    return raw;
  }
  return null;
}

function normalizeStatus(ex) {
  const s = ex.smart_status ?? ex.status;
  if (s == null || s === "") return "";
  return String(s).toLowerCase().trim();
}

async function fetchBolnaExecution(apiKey, executionId) {
  const agentId = process.env.BOLNA_AGENT_ID?.trim();
  const urls = [];
  if (agentId) {
    urls.push(
      `https://api.bolna.ai/agent/${encodeURIComponent(agentId)}/execution/${encodeURIComponent(executionId)}`
    );
    urls.push(
      `https://api.bolna.ai/v2/agent/${encodeURIComponent(agentId)}/execution/${encodeURIComponent(executionId)}`
    );
  }
  urls.push(`https://api.bolna.ai/executions/${encodeURIComponent(executionId)}`);

  let lastErr = null;
  for (const url of urls) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (e) {
      lastErr = e.message;
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      lastErr = `${res.status} ${text.slice(0, 200)}`;
      continue;
    }
    try {
      const raw = JSON.parse(text);
      const ex = normalizeExecutionPayload(raw);
      if (ex) return { ex, url };
    } catch (e) {
      lastErr = e.message;
    }
  }
  return { ex: null, lastErr };
}

const pollThrottleMs = 5000;
const lastPollByCandidateId = new Map();

async function syncCallingCandidatesFromBolna() {
  const apiKey = normalizeBolnaApiKey(process.env.BOLNA_API_KEY);
  if (!apiKey) return;

  const rows = await getAll(
    "SELECT id, bolna_call_id FROM candidates WHERE status = 'calling' AND bolna_call_id IS NOT NULL"
  );
  const now = Date.now();

  for (const row of rows) {
    const last = lastPollByCandidateId.get(row.id) || 0;
    if (now - last < pollThrottleMs) continue;
    lastPollByCandidateId.set(row.id, now);

    const { ex, lastErr } = await fetchBolnaExecution(apiKey, row.bolna_call_id);
    if (!ex) {
      console.warn(
        `Bolna execution poll failed for candidate ${row.id} execution=${row.bolna_call_id}:`,
        lastErr || "no body"
      );
      continue;
    }

    const st = normalizeStatus(ex);
    const extractionReady = hasUsableExtraction(ex);

    if (STATUS_ON_CALL.has(st)) {
      continue;
    }

    if (FAILURE_TERMINAL.has(st) && !extractionReady) {
      const note = `Call ended: ${st}${ex.error_message ? ` — ${ex.error_message}` : ""}`;
      const prev = await getOne("SELECT notes FROM candidates WHERE id = ?", [row.id]);
      const merged = prev?.notes ? `${prev.notes}\n${note}` : note;
      await run(
        "UPDATE candidates SET status = 'uploaded', bolna_call_id = NULL, notes = ? WHERE id = ?",
        [merged, row.id]
      );
      console.log(`📡 Polled Bolna: candidate ${row.id} → uploaded (${st})`);
      continue;
    }

    const shouldScreen = extractionReady || STATUS_SCREENED.has(st);
    if (shouldScreen) {
      let data = ex.extracted_data;
      if (data != null && typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          data = {};
        }
      }
      if (!data || typeof data !== "object") data = {};
      try {
        await applyScreeningData(row.id, data, ex.transcript);
        console.log(
          `📡 Polled Bolna: candidate ${row.id} → screened (${st || "n/a"}${extractionReady ? ", extraction" : ""})`
        );
      } catch (e) {
        console.error("applyScreeningData after poll failed:", e.message);
      }
      continue;
    }

    if (st === "call-disconnected" && !extractionReady) {
      continue;
    }

    if (st) {
      console.warn(`Bolna execution poll: unhandled status "${st}" for candidate ${row.id}`);
    }
  }
}

module.exports = { syncCallingCandidatesFromBolna };
