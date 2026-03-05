const express = require("express");
const router = express.Router();
const { getOne, run } = require("../db");

// POST /api/webhook — receives Bolna call results
router.post("/", async (req, res) => {
  console.log("\n📥 Webhook received from Bolna");
  console.log("Payload:", JSON.stringify(req.body, null, 2));

  const payload = req.body;

  // Guard: skip intermediate webhooks (ringing, in-progress, etc.)
  // Only process the final webhook that contains extracted_data
  if (!payload.extracted_data) {
    console.log("⏭️  Intermediate webhook (no extracted_data yet), skipping");
    return res.status(200).json({ received: true });
  }

  // Extract call ID — Bolna sends it in payload.id
  const call_id = payload.id || payload.call_id || null;
  if (!call_id) {
    console.log("⚠️  No call id found in payload, ignoring");
    return res.status(200).json({ ok: true });
  }
  console.log(`✅ Processing final webhook for call ID: ${call_id}`);

  // PROBLEM 3 — candidate lookup with clear logging on miss
  console.log(`🔍 Looking up candidate with bolna_call_id: ${call_id}`);
  let candidate = await getOne(
    "SELECT * FROM candidates WHERE bolna_call_id = ?",
    [call_id]
  );

  if (!candidate) {
    console.log(`⚠️ No match for call_id: ${call_id}`);
    console.log("ℹ️  Stored bolna_call_ids in DB:");
    // Log all stored call IDs so we can diff and debug the mismatch
    const { getAll } = require("../db");
    const all = await getAll("SELECT id, name, bolna_call_id FROM candidates");
    all.forEach((r) =>
      console.log(`   candidate ${r.id} (${r.name}) → bolna_call_id: ${r.bolna_call_id}`)
    );
    return res.status(200).json({ ok: true });
  }
  console.log(`✅ Found candidate: ${candidate.name} (id: ${candidate.id})`);

  // Parse extracted_data (may be a JSON string or already an object)
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
    console.log("⚠️  extracted_data is missing or invalid, using empty object");
    data = {};
  }
  console.log("📊 Extracted data:", JSON.stringify(data, null, 2));

  // Helper: boolean / truthy → SQLite integer
  const boolToInt = (val) => {
    if (val === true  || val === 1 || val === "true"  || val === "yes") return 1;
    if (val === false || val === 0 || val === "false" || val === "no")  return 0;
    return null;
  };

  // Update candidate row with all extracted fields
  const screened_at = new Date().toISOString();

  try {
    await run(
      `UPDATE candidates SET
        status = 'screened',
        screened_at = ?,
        years_of_experience = ?,
        recent_role = ?,
        skill_rating = ?,
        notice_period = ?,
        notice_flexible = ?,
        expected_ctc = ?,
        location_comfortable = ?,
        call_completed = ?,
        candidate_available = ?,
        fit_score = ?,
        recommendation = ?,
        notes = ?,
        transcript = ?
      WHERE id = ?`,
      [
        screened_at,
        data.years_of_experience !== undefined ? data.years_of_experience : null,
        data.recent_role || null,
        data.skill_rating !== undefined ? data.skill_rating : null,
        data.notice_period || null,
        boolToInt(data.notice_flexible),
        data.expected_ctc || null,
        boolToInt(data.location_comfortable),
        boolToInt(data.call_completed),
        boolToInt(data.candidate_available),
        data.fit_score !== undefined ? data.fit_score : null,
        data.recommendation || null,
        data.notes || null,
        payload.transcript || null,
        candidate.id,
      ]
    );

    console.log(`✅ Updated candidate to screened`);
    console.log(`✅ Found candidate: ${candidate.name} — Fit Score: ${data.fit_score} | Recommendation: ${data.recommendation}`);
  } catch (err) {
    console.error("❌ Failed to update candidate after webhook:", err.message);
    // Return 200 so Bolna doesn't retry infinitely
    return res.status(200).json({ ok: true, warning: "DB update failed" });
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
