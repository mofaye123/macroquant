import { cn } from "@/lib/utils";

type StatusPillProps = {
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export const StatusPill = ({ label, tone }: StatusPillProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-[12px] py-[5px] text-[11px] font-semibold tracking-[0.1em]",
        tone === "positive" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "negative" && "border-rose-200 bg-rose-50 text-rose-700",
        tone === "neutral" && "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      {label}
    </span>
  );
};
