import React from "react";
import { Users, PhoneCall, CheckCircle, Clock } from "lucide-react";

export default function StatsBanner({ candidates }) {
  const total = candidates.length;

  const screened = candidates.filter((c) =>
    ["screened", "shortlisted", "rejected"].includes(c.status)
  ).length;

  const shortlisted = candidates.filter(
    (c) => c.status === "shortlisted" || c.recommendation === "shortlist"
  ).length;

  const pending = candidates.filter((c) =>
    ["uploaded", "calling"].includes(c.status)
  ).length;

  const stats = [
    {
      label: "Total Candidates",
      value: total,
      icon: Users,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
    },
    {
      label: "Screened",
      value: screened,
      icon: PhoneCall,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Shortlisted",
      value: shortlisted,
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className={`rounded-xl border ${stat.border} ${stat.bg} p-4 flex items-center gap-4`}
          >
            <div className={`p-2 rounded-lg bg-slate-800`}>
              <Icon size={20} className={stat.color} />
            </div>
            <div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{stat.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
