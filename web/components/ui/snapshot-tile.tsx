import { cn } from "@/lib/utils";

type SnapshotTileProps = {
  label: string;
  value: string;
  delta: string;
  state: "positive" | "negative" | "neutral";
};

export const SnapshotTile = ({ label, value, delta, state }: SnapshotTileProps) => {
  return (
    <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
      <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">{label}</p>
      <p className="mt-[8px] text-[20px] font-bold text-app-text">{value}</p>
      <p
        className={cn(
          "mt-[4px] text-[11px] font-semibold",
          state === "positive" && "text-app-success",
          state === "negative" && "text-app-danger",
          state === "neutral" && "text-app-muted"
        )}
      >
        {delta}
      </p>
    </div>
  );
};
