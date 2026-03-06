"use client";

import Link from "next/link";

import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { ResearchDocument } from "@/lib/market-analysis-library";

type BlogPostReaderProps = {
  post: ResearchDocument;
  basePath: string;
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

export function BlogPostReader({ post, basePath }: BlogPostReaderProps) {
  const blocks = parseParagraphBlocks(post.content);

  return (
    <div className="space-y-[16px]">
      <SurfaceCard>
        <div className="flex items-center justify-between gap-[8px]">
          <SectionTitle title="文章详情" />
          <Link href={basePath} className="text-[12px] font-semibold text-blue-600 hover:text-blue-700">
            返回列表
          </Link>
        </div>
        <p className="mt-[10px] text-[11px] uppercase tracking-[0.08em] text-app-muted">{post.date}</p>
        <h1 className="mt-[6px] text-[30px] font-semibold leading-tight text-app-text">{post.title}</h1>
        <div className="mt-[10px] flex flex-wrap gap-[6px]">
          {post.tags.map((tag) => (
            <span
              key={`${post.id}-${tag}`}
              className="rounded-full border border-app-border bg-app-bg px-[8px] py-[2px] text-[11px] text-app-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <article className="rounded-[12px] border border-app-border bg-white px-[20px] py-[18px]">
          <div className="space-y-[12px]">
            {blocks.map((block, idx) => {
              if (block.type === "heading") {
                return (
                  <h2 key={`${post.id}-h-${idx}`} className="pt-[6px] text-[22px] font-semibold leading-tight text-slate-900">
                    {block.text}
                  </h2>
                );
              }

              if (block.type === "ul") {
                return (
                  <ul
                    key={`${post.id}-ul-${idx}`}
                    className="list-disc space-y-[4px] pl-[20px] text-[16px] leading-[1.9] text-app-text"
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
                    className="list-decimal space-y-[4px] pl-[20px] text-[16px] leading-[1.9] text-app-text"
                  >
                    {block.items.map((item, listIdx) => (
                      <li key={`${post.id}-ol-${idx}-${listIdx}`}>{item}</li>
                    ))}
                  </ol>
                );
              }

              return (
                <p key={`${post.id}-p-${idx}`} className="text-[17px] leading-[1.95] text-slate-800">
                  {block.text}
                </p>
              );
            })}
          </div>
        </article>
      </SurfaceCard>
    </div>
  );
}
