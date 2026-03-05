import React, { useState } from "react";
import { X, CheckCircle, XCircle } from "lucide-react";

function RecommendationBadge({ value }) {
  if (!value) return null;
  const styles = {
    shortlist: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    maybe: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    reject: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  const labels = { shortlist: "Shortlist", maybe: "Maybe", reject: "Reject" };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${styles[value] || "bg-slate-500/20 text-slate-400 border border-slate-500/30"}`}>
      {labels[value] || value}
    </span>
  );
}

function FitScoreBadge({ score }) {
  if (score == null) return null;
  let cls = "bg-red-500/20 text-red-400 border-red-500/30";
  if (score >= 7) cls = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  else if (score >= 5) cls = "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {score}/10
    </span>
  );
}

function DetailRow({ icon, label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className="text-sm text-slate-100 break-words">{value}</div>
      </div>
    </div>
  );
}

export default function TranscriptModal({ candidate, onClose, onStatusChange }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAction = async (newStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed to update status: ${data.error || "Unknown error"}`);
        return;
      }
      onStatusChange();
      onClose();
    } catch (err) {
      alert("Network error");
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const boolLabel = (val) => {
    if (val === true || val === 1) return "Yes";
    if (val === false || val === 0) return "No";
    return "—";
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-700 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">{candidate.name}</h2>
            {candidate.email && (
              <p className="text-sm text-slate-400 mt-0.5">{candidate.email}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <FitScoreBadge score={candidate.fit_score} />
              <RecommendationBadge value={candidate.recommendation} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex gap-0 min-h-0">
          {/* Left column — Screening Results */}
          <div className="w-2/5 border-r border-slate-700 overflow-y-auto p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Screening Results
            </h3>
            <div className="space-y-0">
              <DetailRow
                icon="🧑‍💼"
                label="Experience"
                value={
                  candidate.years_of_experience != null
                    ? `${candidate.years_of_experience} year${candidate.years_of_experience !== 1 ? "s" : ""}${candidate.recent_role ? ` · ${candidate.recent_role}` : ""}`
                    : candidate.recent_role || null
                }
              />
              <DetailRow
                icon="⭐"
                label="Skill Rating"
                value={candidate.skill_rating != null ? `${candidate.skill_rating}/10` : null}
              />
              <DetailRow
                icon="⏳"
                label="Notice Period"
                value={
                  candidate.notice_period
                    ? `${candidate.notice_period}${candidate.notice_flexible ? " (flexible)" : ""}`
                    : null
                }
              />
              <DetailRow
                icon="💰"
                label="Expected CTC"
                value={candidate.expected_ctc}
              />
              <DetailRow
                icon="📍"
                label="Location OK (Bengaluru)"
                value={boolLabel(candidate.location_comfortable)}
              />
              <DetailRow
                icon="✅"
                label="Call Completed"
                value={boolLabel(candidate.call_completed)}
              />
              <DetailRow
                icon="🙋"
                label="Candidate Available"
                value={boolLabel(candidate.candidate_available)}
              />
              {candidate.notes && (
                <DetailRow
                  icon="📝"
                  label="Notes"
                  value={candidate.notes}
                />
              )}
              {candidate.screened_at && (
                <DetailRow
                  icon="🕐"
                  label="Screened At"
                  value={new Date(candidate.screened_at).toLocaleString()}
                />
              )}
            </div>
          </div>

          {/* Right column — Transcript */}
          <div className="flex-1 overflow-hidden flex flex-col p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Call Transcript
            </h3>
            <div className="flex-1 overflow-y-auto transcript-scroll bg-slate-900 rounded-xl p-4 border border-slate-700">
              {candidate.transcript ? (
                <pre className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                  {candidate.transcript}
                </pre>
              ) : (
                <p className="text-slate-500 text-sm italic">Transcript not available</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Phone: {candidate.phone}
          </div>

          {candidate.status === "screened" ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAction("rejected")}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle size={15} />
                Reject
              </button>
              <button
                onClick={() => handleAction("shortlisted")}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle size={15} />
                Shortlist
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Status:</span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  candidate.status === "shortlisted"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                }`}
              >
                {candidate.status === "shortlisted" ? "✅ Shortlisted" : "❌ Rejected"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
