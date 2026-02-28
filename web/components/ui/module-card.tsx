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
      className="group rounded-[18px] border border-app-border bg-app-card p-[18px] shadow-[0_20px_48px_-34px_rgba(15,23,42,0.33)] transition-transform duration-300 hover:-translate-y-[3px]"
    >
      <div className="mb-[10px] flex items-start justify-between gap-[10px]">
        <div>
          <span className="rounded-[5px] bg-slate-100 px-[6px] py-[2px] text-[10px] font-semibold tracking-[0.14em] text-slate-500">
            MOD {module.id}
          </span>
          <p className="mt-[8px] text-[15px] font-bold text-app-text">{module.title}</p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-app-muted">{module.subtitle}</p>
        </div>
        <span className="text-[11px] font-semibold text-app-muted">{module.weight}</span>
      </div>

      <div className="mb-[10px] flex items-end gap-[10px]">
        <strong className="text-[30px] leading-none text-app-text">{module.score.toFixed(1)}</strong>
        <span
          className={cn(
            "text-[12px] font-semibold",
            module.change >= 0 ? "text-app-success" : "text-app-danger"
          )}
        >
          {formatSigned(module.change)}
        </span>
      </div>

      <div className="h-[8px] overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${module.score}%` }} />
      </div>

      <p className="mt-[13px] border-t border-slate-100 pt-[10px] text-[12px] leading-relaxed text-app-muted">
        {module.description}
      </p>
    </Link>
  );
};
