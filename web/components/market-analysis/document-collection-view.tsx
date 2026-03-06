"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { ResearchDocument } from "@/lib/market-analysis-library";
import { cn } from "@/lib/utils";

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
                    "rounded-[14px] border bg-white p-[14px] text-left transition-all",
                    isActive
                      ? "border-blue-300 shadow-soft"
                      : "border-app-border hover:-translate-y-[1px] hover:border-blue-200"
                  )}
                >
                  <p className="text-[15px] font-semibold text-app-text">{doc.title}</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">数据日期：{doc.date} · 行数：{doc.lineCount}</p>
                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                    {doc.tags.map((tag) => (
                      <span key={`${doc.id}-${tag}`} className="rounded-full border border-app-border bg-app-bg px-[8px] py-[2px] text-[11px] text-app-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-[8px] max-h-[56px] overflow-hidden text-[12px] leading-relaxed text-app-muted">{doc.preview}</p>
                  <p className="mt-[10px] text-[12px] font-semibold text-blue-600">打开阅读</p>
                </button>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      {activeDoc ? (
        <SurfaceCard>
          <SectionTitle title={`正文 · ${activeDoc.title}`} />
          <p className="mt-[8px] text-[12px] text-app-muted">来源文件：{activeDoc.sourceFiles.join("；")}</p>
          {!!activeDoc.toc.length && (
            <div className="mt-[10px] rounded-[12px] border border-app-border bg-app-bg px-[12px] py-[10px]">
              <p className="text-[12px] font-semibold text-app-text">目录预览</p>
              <div className="mt-[6px] space-y-[4px]">
                {activeDoc.toc.map((item) => (
                  <p key={`${activeDoc.id}-${item}`} className="text-[12px] text-app-muted">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-[12px] max-h-[70vh] overflow-auto rounded-[12px] border border-app-border bg-white px-[14px] py-[12px]">
            <pre
              className={cn(
                "whitespace-pre-wrap break-words text-[13px] leading-relaxed text-app-text",
                activeDoc.tags.includes("代码节选") ? "font-mono text-[12px]" : "font-sans"
              )}
            >
              {activeDoc.content}
            </pre>
          </div>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
