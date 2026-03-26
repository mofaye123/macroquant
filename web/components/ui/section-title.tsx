import { ReactNode } from "react";

type SectionTitleProps = {
  title: string;
  rightSlot?: ReactNode;
};

export const SectionTitle = ({ title, rightSlot }: SectionTitleProps) => {
  return (
    <div className="flex items-center gap-[10px]">
      <span className="h-[7px] w-[7px] rounded-full bg-app-burgundy" />
      <h2 className="font-sans text-[13px] font-semibold uppercase tracking-[0.24em] text-app-text">{title}</h2>
      <div className="h-px flex-1 bg-[rgba(26,26,26,0.12)]" />
      {rightSlot}
    </div>
  );
};
