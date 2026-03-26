import { cn } from "@/lib/utils";

type StatusPillProps = {
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export const StatusPill = ({ label, tone }: StatusPillProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-[12px] py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone === "positive" && "border-[rgba(26,77,46,0.18)] bg-[rgba(26,77,46,0.08)] text-[#1a4d2e]",
        tone === "negative" && "border-[rgba(123,45,44,0.18)] bg-[rgba(123,45,44,0.08)] text-[#7b2d2c]",
        tone === "neutral" && "border-[rgba(26,26,26,0.12)] bg-[rgba(26,26,26,0.04)] text-app-muted"
      )}
    >
      {label}
    </span>
  );
};
