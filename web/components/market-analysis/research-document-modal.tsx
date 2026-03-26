"use client";

import { useEffect } from "react";

import type { ResearchDocument } from "@/lib/market-analysis-library";
import { cn } from "@/lib/utils";

import { BlogPostReader } from "./blog-post-reader";

type ResearchDocumentModalProps = {
  post: ResearchDocument;
  basePath: string;
  onClose: () => void;
};

export function ResearchDocumentModal({ post, basePath, onClose }: ResearchDocumentModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-[rgba(26,26,26,0.48)] px-[12px] py-[12px] backdrop-blur-[4px] sm:px-[24px] sm:py-[24px]"
      onClick={onClose}
      role="presentation"
    >
      <div className="mx-auto flex h-full w-full max-w-[1120px] items-center justify-center">
        <div
          className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-[#c8bfa8] bg-[#f5f0e8] shadow-[0_24px_90px_rgba(0,0,0,0.28)]"
          )}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={post.title}
        >
          <div className="flex items-center justify-between gap-[16px] border-b border-[rgba(26,26,26,0.10)] px-[20px] py-[14px] sm:px-[28px]">
            <div className="space-y-[2px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B4513]">MacroQuant Research</p>
              <p className="text-[11px] text-app-muted">按 Esc 关闭或点击遮罩返回列表</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[2px] border border-[rgba(26,26,26,0.15)] bg-white px-[12px] py-[6px] text-[12px] font-semibold text-[#1a1a1a] transition-colors hover:border-[#2D5016] hover:text-[#2D5016]"
            >
              关闭
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[18px] sm:px-[32px] sm:py-[28px]">
            <BlogPostReader post={post} basePath={basePath} showBackLink={false} className="max-w-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
