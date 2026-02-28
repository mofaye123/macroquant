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
        "rounded-[18px] border border-app-border bg-app-card p-[18px] shadow-[0_24px_55px_-36px_rgba(15,23,42,0.36)]",
        className
      )}
    >
      {children}
    </section>
  );
};
