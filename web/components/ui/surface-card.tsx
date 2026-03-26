import { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>;

export const SurfaceCard = ({ children, className, ...rest }: SurfaceCardProps) => {
  return (
    <section
      {...rest}
      className={cn(
        "rounded-[12px] border border-app-border bg-[rgba(255,253,248,0.86)] p-[18px] shadow-card backdrop-blur-[2px]",
        className
      )}
    >
      {children}
    </section>
  );
};
