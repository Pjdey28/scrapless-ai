import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
}

export function KpiCard({ label, value, caption, icon: Icon }: KpiCardProps) {
  return (
    <article className="card kpi-card">
      <div className="kpi-top">
        <span className="kpi-icon"><Icon size={18} aria-hidden="true" /></span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {caption && <p className="kpi-caption">{caption}</p>}
    </article>
  );
}
