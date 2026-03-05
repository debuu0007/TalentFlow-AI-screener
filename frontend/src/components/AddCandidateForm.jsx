import React, { useState } from "react";
import { UserPlus, CheckCircle, AlertCircle } from "lucide-react";

export default function AddCandidateForm({ onCandidateAdded }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      showToast("error", "Full name is required");
      return;
    }
    if (!form.phone.trim()) {
      showToast("error", "Phone number is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast("error", data.error || "Failed to add candidate");
        return;
      }

      showToast("success", "Candidate added!");
      setForm({ name: "", phone: "", email: "" });
      onCandidateAdded();
    } catch (err) {
      showToast("error", "Network error, please try again");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <UserPlus size={18} className="text-indigo-400" />
        <h2 className="font-semibold text-slate-100 text-sm">Add Candidate</h2>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium ${
            toast.type === "success"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-red-500/20 text-red-400 border border-red-500/30"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          {toast.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Priya Sharma"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Phone Number <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+91XXXXXXXXXX"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Email <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="candidate@example.com"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <UserPlus size={15} />
              Add Candidate
            </>
          )}
        </button>
      </form>
    </div>
  );
}
