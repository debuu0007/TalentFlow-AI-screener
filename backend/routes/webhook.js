const express = require("express");
const router = express.Router();
const { getOne, getAll, run } = require("../db");
const { applyScreeningData } = require("../screeningUpdate");

/** Match Bolna: ratings land after `completed`; `call-disconnected` is still upstream of extraction. */
const SUCCESS_SCREENED = new Set(["completed", "stopped"]);
const FAILURE_TERMINAL = new Set([
  "failed",
  "no-answer",
  "busy",
  "canceled",
  "error",
  "balance-low",
]);

function extractWebhookExecutionId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const p = payload;
  return (
    p.id ||
    p.execution_id ||
    p.executionId ||
    p.call_id ||
    p.callId ||
    (p.data && (p.data.id || p.data.execution_id || p.data.call_id)) ||
    null
  );
}

function payloadStatus(payload) {
  return (
    payload.smart_status ||
    payload.status ||
    payload.call_status ||
    payload.execution_status ||
    (payload.data && (payload.data.smart_status || payload.data.status)) ||
    null
  );
}

function hasExtractedPayload(payload) {
  const ed = payload.extracted_data;
  if (ed == null || ed === "") return false;
  if (typeof ed === "string") return ed.trim().length > 0;
  if (typeof ed === "object") return true;
  return false;
}

function isIntermediateOnly(payload) {
  if (hasExtractedPayload(payload)) return false;
  const st = payloadStatus(payload);
  if (!st) return true;
  const stl = String(st).toLowerCase().trim();
  const intermediate = new Set([
    "scheduled",
    "queued",
    "rescheduled",
    "initiated",
    "ringing",
    "in-progress",
    "call-disconnected",
  ]);
  return intermediate.has(stl);
}

// POST /api/webhook — receives Bolna call results
router.post("/", async (req, res) => {
  console.log("\n📥 Webhook received from Bolna");
  console.log("Payload:", JSON.stringify(req.body, null, 2));

  const payload = req.body;
  const call_id = extractWebhookExecutionId(payload);

  if (!call_id) {
    console.log("⚠️  No execution / call id found in payload, ignoring");
    return res.status(200).json({ ok: true });
  }

  if (isIntermediateOnly(payload)) {
    console.log("⏭️  Intermediate webhook, skipping (no extraction yet)");
    return res.status(200).json({ received: true });
  }

  const stRaw = payloadStatus(payload);
  const st = stRaw ? String(stRaw).toLowerCase().trim() : "";
  const terminalFail = st && FAILURE_TERMINAL.has(st);
  const terminalScreened = st && SUCCESS_SCREENED.has(st);
  const shouldFinalize =
    hasExtractedPayload(payload) || terminalScreened || terminalFail;

  if (!shouldFinalize) {
    console.log("⏭️  Webhook not final (no extraction, not a terminal status we handle), skipping");
    return res.status(200).json({ received: true });
  }

  console.log(`✅ Processing webhook for call ID: ${call_id} (status=${stRaw || "n/a"})`);

  console.log(`🔍 Looking up candidate with bolna_call_id: ${call_id}`);
  let candidate = await getOne(
    "SELECT * FROM candidates WHERE bolna_call_id = ? COLLATE NOCASE",
    [call_id]
  );

  if (!candidate) {
    console.log(`⚠️ No match for call_id: ${call_id}`);
    console.log("ℹ️  Stored bolna_call_ids in DB:");
    const all = await getAll("SELECT id, name, bolna_call_id FROM candidates");
    all.forEach((r) =>
      console.log(`   candidate ${r.id} (${r.name}) → bolna_call_id: ${r.bolna_call_id}`)
    );
    return res.status(200).json({ ok: true });
  }
  console.log(`✅ Found candidate: ${candidate.name} (id: ${candidate.id})`);

  if (terminalFail) {
    const note = `Call ended: ${stRaw || st}${payload.error_message ? ` — ${payload.error_message}` : ""}`;
    try {
      const prev = await getOne("SELECT notes FROM candidates WHERE id = ?", [candidate.id]);
      const merged = prev?.notes ? `${prev.notes}\n${note}` : note;
      await run(
        "UPDATE candidates SET status = 'uploaded', bolna_call_id = NULL, notes = ? WHERE id = ?",
        [merged, candidate.id]
      );
      console.log(`✅ Webhook: candidate ${candidate.id} → uploaded (${st})`);
    } catch (err) {
      console.error("❌ Failed terminal-fail update:", err.message);
    }
    return res.status(200).json({ ok: true });
  }

  let data = payload.extracted_data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
      console.log("🔄 Parsed extracted_data from JSON string");
    } catch (e) {
      console.error("❌ Failed to parse extracted_data string:", e.message);
      data = {};
    }
  }
  if (!data || typeof data !== "object") {
    data = {};
  }
  console.log("📊 Extracted data:", JSON.stringify(data, null, 2));

  const transcript = payload.transcript || null;

  try {
    await applyScreeningData(candidate.id, data, transcript);
    console.log(`✅ Updated candidate to screened`);
    console.log(
      `✅ Found candidate: ${candidate.name} — Fit Score: ${data.fit_score} | Recommendation: ${data.recommendation}`
    );
  } catch (err) {
    console.error("❌ Failed to update candidate after webhook:", err.message);
    return res.status(200).json({ ok: true, warning: "DB update failed" });
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
