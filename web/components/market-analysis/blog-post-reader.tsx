"use client";

import Link from "next/link";

import type { ResearchDocument } from "@/lib/market-analysis-library";
import { cn } from "@/lib/utils";

type BlogPostReaderProps = {
  post: ResearchDocument;
  basePath: string;
  showBackLink?: boolean;
  className?: string;
};

type ParagraphBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

const headingPattern = /^(?:目录|附录|总结|[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?)/;

const parseParagraphBlocks = (content: string): ParagraphBlock[] => {
  const chunks = content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    const bulletItems = lines
      .filter((line) => /^[-•·]\s+/.test(line))
      .map((line) => line.replace(/^[-•·]\s+/, ""));
    if (bulletItems.length === lines.length && bulletItems.length > 0) {
      return { type: "ul", items: bulletItems };
    }

    const orderedItems = lines
      .filter((line) => /^[0-9]+[.、)]\s*/.test(line))
      .map((line) => line.replace(/^[0-9]+[.、)]\s*/, ""));
    if (orderedItems.length === lines.length && orderedItems.length > 0) {
      return { type: "ol", items: orderedItems };
    }

    const plainText = lines.join(" ");
    if (headingPattern.test(plainText) && plainText.length <= 72) {
      return { type: "heading", text: plainText };
    }
    return { type: "paragraph", text: plainText };
  });
};

export function BlogPostReader({ post, basePath, showBackLink = true, className }: BlogPostReaderProps) {
  const blocks = parseParagraphBlocks(post.content);

  return (
    <div className={cn("mx-auto w-full max-w-[820px] space-y-[22px]", className)}>
      {showBackLink ? (
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-app-muted">MacroQuant Research</p>
          <Link href={basePath} className="text-[12px] font-semibold text-[#8B4513] hover:text-[#2D5016]">
            返回列表
          </Link>
        </div>
      ) : null}

      <header className="text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-app-muted">{post.date}</p>
        <h1 className="mt-[10px] text-[36px] font-semibold leading-[1.18] tracking-[-0.01em] text-[#0f0f0f]">
          {post.title}
        </h1>
        <div className="mt-[14px] flex flex-wrap items-center justify-center gap-[6px]">
          {post.tags.map((tag) => (
            <span
              key={`${post.id}-${tag}`}
              className="rounded-[2px] border border-[rgba(26,26,26,0.12)] bg-white px-[9px] py-[3px] text-[11px] font-medium text-app-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </header>

      <article className="rounded-[4px] border border-[#c8bfa8] bg-white px-[28px] py-[24px] shadow-[0_1px_0_rgba(0,0,0,0.03)]">
        <div className="space-y-[13px]">
          {blocks.map((block, idx) => {
            if (block.type === "heading") {
              return (
                <h2
                  key={`${post.id}-h-${idx}`}
                  className="border-l-[3px] border-[#2D5016] bg-[rgba(45,80,22,0.05)] pl-[10px] pt-[5px] text-[20px] font-semibold leading-tight text-[#121212]"
                >
                  {block.text}
                </h2>
              );
            }

            if (block.type === "ul") {
              return (
                <ul
                  key={`${post.id}-ul-${idx}`}
                  className="list-disc space-y-[6px] pl-[20px] text-[16px] leading-[1.9] text-[#1a1a1a]"
                >
                  {block.items.map((item, listIdx) => (
                    <li key={`${post.id}-ul-${idx}-${listIdx}`}>{item}</li>
                  ))}
                </ul>
              );
            }

            if (block.type === "ol") {
              return (
                <ol
                  key={`${post.id}-ol-${idx}`}
                  className="list-decimal space-y-[6px] pl-[20px] text-[16px] leading-[1.9] text-[#1a1a1a]"
                >
                  {block.items.map((item, listIdx) => (
                    <li key={`${post.id}-ol-${idx}-${listIdx}`}>{item}</li>
                  ))}
                </ol>
              );
            }

            return (
              <p key={`${post.id}-p-${idx}`} className="text-[16px] leading-[1.9] text-[#1a1a1a]">
                {block.text}
              </p>
            );
          })}
        </div>
      </article>
    </div>
  );
}
