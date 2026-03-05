import React, { useState, useEffect, useCallback } from "react";
import StatsBanner from "./components/StatsBanner";
import CandidateTable from "./components/CandidateTable";
import AddCandidateForm from "./components/AddCandidateForm";
import TranscriptModal from "./components/TranscriptModal";
import EditCandidateModal from "./components/EditCandidateModal";

export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedEditCandidate, setSelectedEditCandidate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/candidates");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCandidates(data);
    } catch (err) {
      console.error("Error fetching candidates:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + 5-second polling
  useEffect(() => {
    fetchCandidates();
    const interval = setInterval(fetchCandidates, 5000);
    return () => clearInterval(interval);
  }, [fetchCandidates]);

  const handleCallTrigger = async (id) => {
    try {
      const res = await fetch(`/api/candidates/${id}/call`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(`Failed to initiate call: ${data.error || "Unknown error"}`);
        return;
      }
      // Optimistically update status in UI
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "calling" } : c))
      );
    } catch (err) {
      alert("Network error when initiating call");
      console.error(err);
    }
  };

  const handleCloseModal = () => {
    setSelectedCandidate(null);
    fetchCandidates(); // refresh after any status changes
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Navbar */}
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              🎙️ TalentFlow
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">AI Recruitment Screener</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Live Dashboard
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {/* Stats banner */}
        <StatsBanner candidates={candidates} />

        {/* Two-column layout */}
        <div className="flex gap-6 items-start">
          {/* Candidate table — 70% */}
          <div className="flex-1 min-w-0" style={{ flexBasis: "70%" }}>
            <CandidateTable
              candidates={candidates}
              isLoading={isLoading}
              onCallTrigger={handleCallTrigger}
              onView={(candidate) => setSelectedCandidate(candidate)}
              onEdit={(candidate) => setSelectedEditCandidate(candidate)}
            />
          </div>

          {/* Add form — 30% */}
          <div style={{ flexBasis: "30%", flexShrink: 0 }}>
            <AddCandidateForm onCandidateAdded={fetchCandidates} />
          </div>
        </div>
      </main>

      {/* Transcript modal */}
      {selectedCandidate && (
        <TranscriptModal
          candidate={selectedCandidate}
          onClose={handleCloseModal}
          onStatusChange={fetchCandidates}
        />
      )}

      {/* Edit candidate modal */}
      {selectedEditCandidate && (
        <EditCandidateModal
          candidate={selectedEditCandidate}
          onClose={() => setSelectedEditCandidate(null)}
          onSave={() => {
            setSelectedEditCandidate(null);
            fetchCandidates();
          }}
        />
      )}
    </div>
  );
}
