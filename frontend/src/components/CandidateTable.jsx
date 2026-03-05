import React from "react";
import { Play, Phone, Eye, Pencil, RefreshCw } from "lucide-react";

function StatusBadge({ status }) {
  const styles = {
    shortlisted: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    screened: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    calling: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-pulse",
    uploaded: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  };

  const labels = {
    shortlisted: "Shortlisted",
    screened: "Screened",
    calling: "Calling...",
    uploaded: "Uploaded",
    rejected: "Rejected",
  };

  const cls = styles[status] || styles.uploaded;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {labels[status] || status}
    </span>
  );
}

function RecommendationBadge({ value }) {
  if (!value) return <span className="text-slate-500 text-xs">—</span>;

  const styles = {
    shortlist: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    maybe: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    reject: "bg-red-500/20 text-red-400 border border-red-500/30",
  };

  const labels = {
    shortlist: "Shortlist",
    maybe: "Maybe",
    reject: "Reject",
  };

  const cls = styles[value] || "bg-slate-500/20 text-slate-400 border border-slate-500/30";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {labels[value] || value}
    </span>
  );
}

function FitScore({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-slate-500 text-sm">—</span>;
  }
  let colorClass = "text-red-400";
  if (score >= 7) colorClass = "text-emerald-400";
  else if (score >= 5) colorClass = "text-amber-400";

  return (
    <span className={`font-semibold ${colorClass}`}>{score}/10</span>
  );
}

export default function CandidateTable({ candidates, isLoading, onCallTrigger, onView, onEdit }) {
  if (isLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 flex items-center justify-center">
        <RefreshCw size={20} className="text-indigo-400 animate-spin mr-2" />
        <span className="text-slate-400">Loading candidates...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="font-semibold text-slate-100 text-sm">Candidates</h2>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <RefreshCw size={12} className="animate-spin" />
          🔄 Live
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="px-6 py-16 text-center text-slate-400 text-sm">
          No candidates yet. Add one using the form →
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Experience</th>
                <th className="text-left px-4 py-3 font-medium">Skill</th>
                <th className="text-left px-4 py-3 font-medium">Notice</th>
                <th className="text-left px-4 py-3 font-medium">CTC</th>
                <th className="text-left px-4 py-3 font-medium">Fit Score</th>
                <th className="text-left px-4 py-3 font-medium">Recommendation</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{c.name}</div>
                    {c.email && (
                      <div className="text-xs text-slate-500 mt-0.5">{c.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {c.years_of_experience != null
                      ? `${c.years_of_experience} yr${c.years_of_experience !== 1 ? "s" : ""}`
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {c.skill_rating != null
                      ? `${c.skill_rating}/10`
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {c.notice_period || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {c.expected_ctc || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <FitScore score={c.fit_score} />
                  </td>
                  <td className="px-4 py-3">
                    <RecommendationBadge value={c.recommendation} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.status === "uploaded" && (
                        <button
                          onClick={() => onCallTrigger(c.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <Play size={12} />
                          Screen Now
                        </button>
                      )}
                      {c.status === "calling" && (
                        <span className="flex items-center gap-1.5 text-xs text-indigo-400 animate-pulse">
                          <Phone size={12} />
                          Calling...
                        </span>
                      )}
                      {["screened", "shortlisted", "rejected"].includes(c.status) && (
                        <button
                          onClick={() => onView(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Eye size={12} />
                          View
                        </button>
                      )}
                      {/* Edit button — always visible for all statuses */}
                      <button
                        onClick={() => onEdit(c)}
                        title="Edit candidate"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
