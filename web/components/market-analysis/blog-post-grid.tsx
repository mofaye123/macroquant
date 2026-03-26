"use client";

import Link from "next/link";

import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { ResearchDocument } from "@/lib/market-analysis-library";

type BlogPostGridProps = {
  title: string;
  description: string;
  basePath: string;
  posts: ResearchDocument[];
  loading: boolean;
  error: string | null;
};

export function BlogPostGrid({
  title,
  description,
  basePath,
  posts,
  loading,
  error,
}: BlogPostGridProps) {
  return (
    <div className="space-y-[16px]">
      <SurfaceCard>
        <SectionTitle title={title} />
        <p className="mt-[10px] text-[14px] leading-relaxed text-app-muted">{description}</p>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center justify-between gap-[10px]">
          <SectionTitle title="Recent Posts" />
          <Link href={basePath} className="text-[11px] font-semibold tracking-[0.08em] text-app-muted hover:text-app-text">
            VIEW ALL
          </Link>
        </div>

        {loading ? (
          <p className="mt-[12px] text-[13px] text-app-muted">正在加载文章...</p>
        ) : error ? (
          <p className="mt-[12px] text-[13px] text-red-500">加载失败：{error}</p>
      ) : posts.length === 0 ? (
          <p className="mt-[12px] text-[13px] text-app-muted">暂无文章。</p>
        ) : (
          <div className="mt-[12px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`${basePath}?doc=${encodeURIComponent(post.id)}`}
                className="group block rounded-[12px] border border-[#c8bfa8] bg-[rgba(255,253,248,0.96)] p-[14px] transition-all hover:-translate-y-[1px] hover:border-[rgba(45,80,22,0.28)] hover:shadow-[0_10px_24px_rgba(26,26,26,0.08)]"
              >
                <div className="flex items-center justify-between gap-[8px]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8B4513]">
                    Research Note
                  </span>
                  <span className="text-[11px] text-app-muted">{post.date}</span>
                </div>
                <p className="mt-[10px] text-[18px] font-semibold leading-tight text-[#0f0f0f] transition-colors group-hover:text-[#2D5016]">
                  {post.title}
                </p>
                <p className="mt-[8px] text-[13px] leading-[1.8] text-app-muted line-clamp-4">{post.preview}</p>
                <div className="mt-[12px] flex flex-wrap gap-[6px]">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={`${post.id}-${tag}`}
                      className="rounded-full border border-[rgba(26,26,26,0.10)] bg-white px-[8px] py-[2px] text-[10px] font-medium text-app-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-[12px] text-[12px] font-semibold text-[#2D5016]">点击弹窗阅读</p>
              </Link>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
