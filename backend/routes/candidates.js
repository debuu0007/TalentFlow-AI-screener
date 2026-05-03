const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const { getAll, getOne, run } = require("../db");
const { syncCallingCandidatesFromBolna } = require("../bolnaSync");

/** Avoid `Bearer Bearer …` if the key was pasted with a Bearer prefix. */
function normalizeBolnaApiKey(raw) {
  if (!raw || typeof raw !== "string") return "";
  let t = raw.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t;
}

/** E.164-friendly: strip spaces/dashes/parens Bolna may reject. */
function normalizeRecipientPhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/[\s\-.()]/g, "");
}

function bolnaUserFacingMessage(bolnaData) {
  if (!bolnaData || typeof bolnaData !== "object") return null;
  if (typeof bolnaData.message === "string" && bolnaData.message.trim()) {
    return bolnaData.message.trim();
  }
  return null;
}

// Helper: map integer fields to booleans for API response
function mapCandidate(row) {
  if (!row) return null;
  return {
    ...row,
    notice_flexible: row.notice_flexible === 1 ? true : row.notice_flexible === 0 ? false : null,
    location_comfortable: row.location_comfortable === 1 ? true : row.location_comfortable === 0 ? false : null,
    call_completed: row.call_completed === 1 ? true : row.call_completed === 0 ? false : null,
    candidate_available: row.candidate_available === 1 ? true : row.candidate_available === 0 ? false : null,
  };
}

// GET /api/candidates — all candidates ordered by created_at DESC
router.get("/", async (req, res) => {
  try {
    await syncCallingCandidatesFromBolna().catch((e) =>
      console.warn("syncCallingCandidatesFromBolna:", e.message)
    );
    const rows = await getAll("SELECT * FROM candidates ORDER BY created_at DESC");
    res.json(rows.map(mapCandidate));
  } catch (err) {
    console.error("GET /api/candidates error:", err);
    res.status(500).json({ error: "Failed to fetch candidates" });
  }
});

// POST /api/candidates — add new candidate
router.post("/", async (req, res) => {
  const { name, phone, email } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required" });
  }

  try {
    const result = await run(
      "INSERT INTO candidates (name, phone, email, status) VALUES (?, ?, ?, 'uploaded')",
      [name.trim(), phone.trim(), email ? email.trim() : null]
    );
    const candidate = await getOne("SELECT * FROM candidates WHERE id = ?", [result.lastID]);
    res.status(201).json(mapCandidate(candidate));
  } catch (err) {
    console.error("POST /api/candidates error:", err);
    res.status(500).json({ error: "Failed to create candidate" });
  }
});

// POST /api/candidates/:id/call — trigger Bolna call
router.post("/:id/call", async (req, res) => {
  const { id } = req.params;

  // 1. Look up candidate
  const candidate = await getOne("SELECT * FROM candidates WHERE id = ?", [id]);
  if (!candidate) {
    return res.status(404).json({ error: "Candidate not found" });
  }

  // 2. Update status to "calling" immediately
  await run("UPDATE candidates SET status = 'calling' WHERE id = ?", [id]);

  try {
    const apiKey = normalizeBolnaApiKey(process.env.BOLNA_API_KEY);
    const agentId = process.env.BOLNA_AGENT_ID?.trim();
    if (!apiKey || !agentId) {
      await run("UPDATE candidates SET status = 'uploaded' WHERE id = ?", [id]);
      return res.status(500).json({
        error: "Server missing BOLNA_API_KEY or BOLNA_AGENT_ID",
        hint: "Use backend/.env and start the server from backend/ or rely on dotenv path fix (loads backend/.env next to index.js).",
      });
    }

    const recipientPhone = normalizeRecipientPhone(candidate.phone);
    if (!recipientPhone || !recipientPhone.startsWith("+")) {
      await run("UPDATE candidates SET status = 'uploaded' WHERE id = ?", [id]);
      return res.status(400).json({
        error: "Phone must be E.164 with country code (e.g. +919876543210)",
        phone: candidate.phone,
      });
    }

    const payload = {
      agent_id: agentId,
      recipient_phone_number: recipientPhone,
      user_data: {
        candidate_name: candidate.name,
      },
    };
    if (process.env.BOLNA_FROM_PHONE_NUMBER?.trim()) {
      payload.from_phone_number = process.env.BOLNA_FROM_PHONE_NUMBER.trim();
    }
    // API calls are often blocked outside agent "calling hours" unless bypassed (dashboard test calls may still work).
    if (process.env.BOLNA_BYPASS_GUARDRAILS !== "false") {
      payload.bypass_call_guardrails = true;
    }

    // 3. Call Bolna API
    const response = await fetch("https://api.bolna.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();
    let bolnaData = {};
    if (rawBody) {
      try {
        bolnaData = JSON.parse(rawBody);
      } catch {
        bolnaData = { parse_error: true, raw: rawBody.slice(0, 500) };
      }
    }
    console.log("Bolna API full response:", JSON.stringify(bolnaData, null, 2));

    if (!response.ok) {
      const bolnaMsg = bolnaUserFacingMessage(bolnaData);
      console.error("❌ Bolna API returned error status:", response.status, bolnaMsg || "");
      await run("UPDATE candidates SET status = 'uploaded' WHERE id = ?", [id]);
      return res.status(502).json({
        error: bolnaMsg ? `Bolna API call failed: ${bolnaMsg}` : "Bolna API call failed",
        details: bolnaData,
        bolna_http_status: response.status,
      });
    }

    // Extract call ID — Bolna returns it as "execution_id"
    const callId = bolnaData.execution_id
                || bolnaData.call_id
                || bolnaData.id
                || null;

    console.log("📌 callId extracted:", callId);

    if (!callId) {
      const bolnaMsg = bolnaUserFacingMessage(bolnaData);
      console.error("❌ Bolna OK response but no execution_id:", JSON.stringify(bolnaData));
      await run("UPDATE candidates SET status = 'uploaded' WHERE id = ?", [id]);
      return res.status(502).json({
        error: bolnaMsg
          ? `Bolna API call failed: ${bolnaMsg}`
          : "Bolna did not return an execution id (check agent_id and API response)",
        details: bolnaData,
      });
    }

    // Save callId + status to DB — awaited explicitly so it always completes
    try {
      await run(
        "UPDATE candidates SET bolna_call_id = ?, status = ? WHERE id = ?",
        [callId, "calling", candidate.id]
      );
    } catch (dbErr) {
      console.error("❌ DB save failed:", dbErr);
    }

    // Verify it was saved
    const updated = await getOne(
      "SELECT id, name, bolna_call_id, status FROM candidates WHERE id = ?",
      [candidate.id]
    );
    console.log("✅ Saved to DB:", JSON.stringify(updated));

    return res.json({ success: true, call_id: callId, status: "calling" });
  } catch (err) {
    console.error("POST /api/candidates/:id/call error:", err);
    // Revert status on error
    await run("UPDATE candidates SET status = 'uploaded' WHERE id = ?", [id]).catch(() => {});
    const network =
      err.code === "ENOTFOUND" ||
      err.code === "ECONNREFUSED" ||
      (err.message && /fetch|network|getaddrinfo/i.test(err.message));
    res.status(network ? 503 : 500).json({
      error: network
        ? "Cannot reach Bolna (network/DNS). Confirm you can reach https://api.bolna.ai from this machine."
        : "Failed to initiate call",
      details: err.message,
    });
  }
});

// Whitelist of fields that PATCH is allowed to update
const PATCH_WHITELIST = new Set([
  "name", "phone", "email",                          // profile (used by EditCandidateModal)
  "status", "bolna_call_id",                         // call state
  "years_of_experience", "recent_role", "skill_rating",
  "notice_period", "notice_flexible", "expected_ctc",
  "location_comfortable", "call_completed", "candidate_available",
  "fit_score", "recommendation", "notes", "transcript", "screened_at",
]);

// PATCH /api/candidates/:id — PROBLEM 2: dynamic update for any whitelisted fields
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  const candidate = await getOne("SELECT * FROM candidates WHERE id = ?", [id]);
  if (!candidate) {
    return res.status(404).json({ error: "Candidate not found" });
  }

  // Build SET clause dynamically from whitelisted keys in body
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(req.body)) {
    if (!PATCH_WHITELIST.has(key)) continue;
    fields.push(`${key} = ?`);
    values.push(value === "" ? null : value);  // treat empty string as null
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  // Extra validation when updating status
  const incomingStatus = req.body.status;
  if (
    incomingStatus !== undefined &&
    !["uploaded", "calling", "screened", "shortlisted", "rejected"].includes(incomingStatus)
  ) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    values.push(id);
    await run(
      `UPDATE candidates SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    console.log(`✏️  Updated candidate ${id}: ${fields.join(", ")}`);

    const updated = await getOne("SELECT * FROM candidates WHERE id = ?", [id]);
    res.json(mapCandidate(updated));
  } catch (err) {
    console.error("PATCH /api/candidates/:id error:", err);
    res.status(500).json({ error: "Failed to update candidate" });
  }
});

module.exports = router;
