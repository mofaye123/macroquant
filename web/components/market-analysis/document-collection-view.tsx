"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { ResearchDocument } from "@/lib/market-analysis-library";
import { cn } from "@/lib/utils";

type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

const headingPattern = /^(?:[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?|附录|总结|目录|[A-G]\.\s)/;
const bulletPattern = /^[-•·]\s+/;
const orderedPattern = /^[0-9]+[.、)]\s*/;

const parseDocumentBlocks = (content: string): DocBlock[] => {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: DocBlock[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  const flushLists = () => {
    if (ulItems.length) {
      blocks.push({ type: "ul", items: ulItems });
      ulItems = [];
    }
    if (olItems.length) {
      blocks.push({ type: "ol", items: olItems });
      olItems = [];
    }
  };

  for (const line of lines) {
    if (bulletPattern.test(line)) {
      olItems = [];
      ulItems.push(line.replace(bulletPattern, ""));
      continue;
    }

    if (orderedPattern.test(line)) {
      ulItems = [];
      olItems.push(line.replace(orderedPattern, ""));
      continue;
    }

    flushLists();
    if (headingPattern.test(line) && line.length <= 64) {
      blocks.push({ type: "heading", text: line });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }

  flushLists();
  return blocks;
};

type DocumentCollectionViewProps = {
  title: string;
  description: string;
  documents: ResearchDocument[];
  loading: boolean;
  error: string | null;
};

export function DocumentCollectionView({
  title,
  description,
  documents,
  loading,
  error,
}: DocumentCollectionViewProps) {
  const [activeId, setActiveId] = useState<string | null>(documents[0]?.id ?? null);
  const [activeHeadingBlockIdx, setActiveHeadingBlockIdx] = useState<number | null>(null);
  const articleContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!documents.length) {
      setActiveId(null);
      return;
    }
    setActiveId((prev) => (prev && documents.some((doc) => doc.id === prev) ? prev : documents[0].id));
  }, [documents]);

  const activeDoc = useMemo(
    () => documents.find((doc) => doc.id === activeId) ?? null,
    [activeId, documents]
  );
  const parsedBlocks = useMemo(
    () => (activeDoc && !activeDoc.tags.includes("代码节选") ? parseDocumentBlocks(activeDoc.content) : []),
    [activeDoc]
  );
  const headingBlocks = useMemo(
    () =>
      parsedBlocks
        .map((block, blockIdx) => (block.type === "heading" ? { blockIdx, text: block.text } : null))
        .filter((item): item is { blockIdx: number; text: string } => Boolean(item)),
    [parsedBlocks]
  );

  useEffect(() => {
    setActiveHeadingBlockIdx(headingBlocks[0]?.blockIdx ?? null);
  }, [activeId, headingBlocks]);

  const scrollToHeading = (blockIdx: number) => {
    setActiveHeadingBlockIdx(blockIdx);
    const container = articleContainerRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector<HTMLElement>(`[data-heading-block-idx="${blockIdx}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-[16px]">
      <SurfaceCard>
        <SectionTitle title={title} rightSlot={<span className="text-[11px] text-app-muted">文档数：{documents.length}</span>} />
        <p className="mt-[10px] text-[14px] leading-relaxed text-app-muted">{description}</p>
      </SurfaceCard>

      <SurfaceCard>
        <SectionTitle title="报告目录" />
        {loading ? (
          <p className="mt-[12px] text-[13px] text-app-muted">正在加载文档库...</p>
        ) : error ? (
          <p className="mt-[12px] text-[13px] text-red-500">加载失败：{error}</p>
        ) : documents.length === 0 ? (
          <p className="mt-[12px] text-[13px] text-app-muted">暂无可展示的文档内容。</p>
        ) : (
          <div className="mt-[12px] grid gap-[12px] md:grid-cols-2">
            {documents.map((doc) => {
              const isActive = doc.id === activeId;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setActiveId(doc.id)}
                  className={cn(
                    "rounded-[12px] border bg-[rgba(255,253,248,0.9)] p-[14px] text-left transition-all",
                    isActive
                      ? "border-[rgba(123,45,44,0.22)] shadow-soft"
                      : "border-app-border hover:-translate-y-[1px] hover:border-[rgba(34,59,91,0.18)]"
                  )}
                >
                  <p className="text-[15px] font-semibold text-app-text">{doc.title}</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">数据日期：{doc.date} · 行数：{doc.lineCount}</p>
                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                    {doc.tags.map((tag) => (
                      <span key={`${doc.id}-${tag}`} className="rounded-full border border-[rgba(26,26,26,0.10)] bg-[rgba(26,26,26,0.03)] px-[8px] py-[2px] text-[11px] text-app-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-[8px] max-h-[56px] overflow-hidden text-[12px] leading-relaxed text-app-muted">{doc.preview}</p>
                  <p className="mt-[10px] text-[12px] font-semibold text-app-navy">打开阅读</p>
                </button>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {activeDoc ? (
        <SurfaceCard>
          <SectionTitle title={`正文 · ${activeDoc.title}`} />
          <div className="mt-[8px] rounded-[10px] border border-[rgba(26,26,26,0.10)] bg-[rgba(26,26,26,0.03)] px-[10px] py-[8px] text-[11px] text-app-muted">
            <p className="font-semibold text-app-text">Research Terminal View</p>
            <p className="mt-[2px]">
              来源：云端文档库（已脱敏） · 数据日期：{activeDoc.date} · 行数：{activeDoc.lineCount}
            </p>
            <p className="mt-[2px]">当前文档：{activeDoc.title}</p>
          </div>

          {activeDoc.tags.includes("代码节选") ? (
            <div className="mt-[12px] max-h-[70vh] overflow-auto rounded-[12px] border border-app-border bg-white px-[14px] py-[12px]">
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-app-text">
                {activeDoc.content}
              </pre>
            </div>
          ) : (
            <div className="mt-[12px] grid gap-[12px] xl:grid-cols-[230px_minmax(0,1fr)]">
              <aside className="rounded-[12px] border border-app-border bg-[rgba(255,253,248,0.9)] px-[10px] py-[10px]">
                <p className="text-[12px] font-semibold text-app-text">目录导航</p>
                <div className="mt-[8px] max-h-[62vh] space-y-[4px] overflow-auto">
                  {headingBlocks.length > 0
                    ? headingBlocks.map((item, idx) => (
                        <button
                          key={`${activeDoc.id}-toc-${item.blockIdx}`}
                          type="button"
                          onClick={() => scrollToHeading(item.blockIdx)}
                          className={cn(
                            "block w-full rounded-[8px] border px-[8px] py-[6px] text-left text-[11px] leading-relaxed transition-colors",
                            activeHeadingBlockIdx === item.blockIdx
                              ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)] text-app-navy"
                              : "border-transparent text-app-muted hover:border-app-border hover:bg-[rgba(26,26,26,0.03)] hover:text-app-text"
                          )}
                        >
                          <span className="mr-[6px] text-[10px] opacity-70">{String(idx + 1).padStart(2, "0")}</span>
                          {item.text}
                        </button>
                      ))
                    : activeDoc.toc.map((item, idx) => (
                        <p
                          key={`${activeDoc.id}-toc-fallback-${idx}`}
                          className="rounded-[8px] border border-transparent px-[8px] py-[6px] text-[11px] leading-relaxed text-app-muted"
                        >
                          {item}
                        </p>
                      ))}
                </div>
              </aside>

              <article
                ref={articleContainerRef}
                className="max-h-[70vh] overflow-auto rounded-[12px] border border-app-border bg-white px-[16px] py-[14px]"
              >
                <div className="space-y-[10px]">
                  {parsedBlocks.map((block, idx) => {
                    if (block.type === "heading") {
                      return (
                        <h3
                          key={`${activeDoc.id}-h-${idx}`}
                          data-heading-block-idx={idx}
                          className="border-l-2 border-blue-300 bg-blue-50/50 pl-[8px] text-[14px] font-semibold text-slate-800"
                        >
                          {block.text}
                        </h3>
                      );
                    }

                    if (block.type === "ul") {
                      return (
                        <ul
                          key={`${activeDoc.id}-ul-${idx}`}
                          className="list-disc space-y-[4px] pl-[18px] text-[13px] leading-relaxed text-app-text"
                        >
                          {block.items.map((item, listIdx) => (
                            <li key={`${activeDoc.id}-ul-${idx}-${listIdx}`}>{item}</li>
                          ))}
                        </ul>
                      );
                    }

                    if (block.type === "ol") {
                      return (
                        <ol
                          key={`${activeDoc.id}-ol-${idx}`}
                          className="list-decimal space-y-[4px] pl-[18px] text-[13px] leading-relaxed text-app-text"
                        >
                          {block.items.map((item, listIdx) => (
                            <li key={`${activeDoc.id}-ol-${idx}-${listIdx}`}>{item}</li>
                          ))}
                        </ol>
                      );
                    }

                    return (
                      <p
                        key={`${activeDoc.id}-p-${idx}`}
                        className="text-[13px] leading-[1.85] text-app-text"
                      >
                        {block.text}
                      </p>
                    );
                  })}
                </div>
              </article>
            </div>
          )}
        </SurfaceCard>
      ) : null}
    </div>
  );
}
