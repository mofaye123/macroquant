import { ReactNode } from "react";

type SectionTitleProps = {
  title: string;
  rightSlot?: ReactNode;
};

export const SectionTitle = ({ title, rightSlot }: SectionTitleProps) => {
  return (
    <div className="flex items-center gap-[10px]">
      <span className="h-[8px] w-[8px] rounded-full bg-app-accent" />
      <h2 className="text-[14px] font-bold uppercase tracking-[0.2em] text-app-text">{title}</h2>
      <div className="h-px flex-1 bg-app-border" />
      {rightSlot}
    </div>
  );
};
