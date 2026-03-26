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

const coverThemes = [
  "from-[#223b5b] via-[#55655b] to-[#f8f5ef]",
  "from-[#7b2d2c] via-[#b45f06] to-[#f8f5ef]",
  "from-[#55655b] via-[#6f6d69] to-[#f8f5ef]",
  "from-[#223b5b] via-[#7b2d2c] to-[#f8f5ef]",
];

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
            {posts.map((post, idx) => (
              <Link
                key={post.id}
                href={`${basePath}?doc=${encodeURIComponent(post.id)}`}
                className="group block rounded-[12px] border border-app-border bg-[rgba(255,253,248,0.9)] p-[10px] transition-all hover:-translate-y-[1px] hover:border-[rgba(34,59,91,0.18)] hover:shadow-soft"
              >
                <div className={`h-[140px] rounded-[10px] bg-gradient-to-br ${coverThemes[idx % coverThemes.length]} p-[12px] text-white`}>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/80">MacroQuant Research</p>
                  <p className="mt-[8px] line-clamp-2 text-[15px] font-semibold leading-tight">{post.title}</p>
                  <div className="mt-[8px] flex flex-wrap gap-[6px]">
                    {post.tags.slice(0, 2).map((tag) => (
                      <span
                        key={`${post.id}-${tag}`}
                        className="rounded-full bg-white/18 px-[7px] py-[2px] text-[10px] font-medium text-white"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="px-[4px] pb-[4px] pt-[10px]">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-app-muted">{post.date}</p>
                  <p className="mt-[6px] line-clamp-2 font-display text-[22px] font-semibold leading-tight text-app-text group-hover:text-app-navy">
                    {post.title}
                  </p>
                  <p className="mt-[8px] line-clamp-3 text-[13px] leading-relaxed text-app-muted">{post.preview}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
