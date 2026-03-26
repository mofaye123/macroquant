import Link from "next/link";

import { ModuleMeta } from "@/lib/types";
import { cn, formatSigned, scoreTone } from "@/lib/utils";

type ModuleCardProps = {
  module: ModuleMeta;
};

export const ModuleCard = ({ module }: ModuleCardProps) => {
  const tone = scoreTone(module.score);
  return (
    <Link
      href={`/modules/${module.slug}`}
      className="group rounded-[12px] border border-app-border bg-[rgba(255,253,248,0.9)] p-[18px] shadow-card transition-transform duration-300 hover:-translate-y-[2px] hover:border-[rgba(123,45,44,0.22)]"
    >
      <div className="mb-[10px] flex items-start justify-between gap-[10px]">
        <div>
          <span className="rounded-[3px] border border-[rgba(26,26,26,0.12)] bg-[rgba(34,59,91,0.06)] px-[6px] py-[2px] font-sans text-[10px] font-semibold tracking-[0.16em] text-app-muted">
            MOD {module.id}
          </span>
          <p className="mt-[8px] font-display text-[16px] font-bold text-app-text">{module.title}</p>
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-app-muted">{module.subtitle}</p>
        </div>
        <span className="font-mono text-[11px] font-semibold text-app-muted">{module.weight}</span>
      </div>

      <div className="mb-[10px] flex items-end gap-[10px]">
        <strong className="font-mono text-[30px] leading-none text-app-text">{module.score.toFixed(1)}</strong>
        <span
          className={cn(
            "text-[12px] font-semibold",
            module.change >= 0 ? "text-app-success" : "text-app-danger"
          )}
        >
          {formatSigned(module.change)}
        </span>
      </div>

      <div className="h-[8px] overflow-hidden rounded-full bg-[rgba(26,26,26,0.06)]">
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${module.score}%` }} />
      </div>

      <p className="mt-[13px] border-t border-[rgba(26,26,26,0.08)] pt-[10px] text-[12px] leading-relaxed text-app-muted">
        {module.description}
      </p>
    </Link>
  );
};
