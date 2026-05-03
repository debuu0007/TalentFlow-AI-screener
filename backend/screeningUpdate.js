const { run } = require("./db");

function boolToInt(val) {
  if (val === true || val === 1 || val === "true" || val === "yes") return 1;
  if (val === false || val === 0 || val === "false" || val === "no") return 0;
  return null;
}

/**
 * Persist post-call screening fields and set status to screened.
 * @param {number} candidateId
 * @param {Record<string, unknown>} data - extracted_data object (may be empty)
 * @param {string|null|undefined} transcript
 */
async function applyScreeningData(candidateId, data, transcript) {
  const screened_at = new Date().toISOString();
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
      transcript || null,
      candidateId,
    ]
  );
}

module.exports = { applyScreeningData, boolToInt };
