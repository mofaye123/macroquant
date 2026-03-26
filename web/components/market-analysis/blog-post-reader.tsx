"use client";

import { useMemo } from "react";
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
  | { type: "heading"; text: string; id: string; anchorKey: string; level: number }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; rows: string[][] };

const headingPattern = /^(?:目录|目 录|附录|总结|结论|执行摘要|[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?)/;

const cleanTocLabel = (text: string) => text.replace(/\s+/g, " ").replace(/\d+$/, "").trim();

const normalizeHeadingKey = (text: string) => {
  return cleanTocLabel(text)
    .replace(/^(?:[一二三四五六七八九十百]+、|[0-9]+(?:\.[0-9]+)*\.?)\s*/, "")
    .replace(/[：:]\s*$/, "")
    .replace(/\s+/g, "");
};

const getHeadingLevel = (text: string) => {
  const cleaned = cleanTocLabel(text);
  const numericMatch = cleaned.match(/^([0-9]+(?:\.[0-9]+)*)(?:\.|\s|$)/);
  if (numericMatch) {
    return Math.min(4, numericMatch[1].split(".").length + 1);
  }
  if (/^[一二三四五六七八九十百]+、/.test(cleaned)) {
    return 2;
  }
  if (/^[（(]?[0-9]+[）)]/.test(cleaned)) {
    return 3;
  }
  return 2;
};

const isHeadingCandidate = (text: string, tocKeySet: Set<string>) => {
  const normalized = normalizeHeadingKey(text);
  if (tocKeySet.has(normalized)) {
    return true;
  }
  if (headingPattern.test(text)) {
    return true;
  }
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  if (hasCjk && text.length <= 28 && !/[。！？：；，,]/.test(text) && !/^\d/.test(text)) {
    return true;
  }
  return false;
};

const isMarkdownTableSeparator = (line: string) => /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);

const splitMarkdownTableRow = (row: string) => {
  const trimmed = row.trim();
  const inner = trimmed.startsWith("|") && trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed;
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of inner) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/\\\|/g, "|").replace(/\\\\/g, "\\"));
};

const parseMarkdownTable = (lines: string[]) => {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length < 2) {
    return null;
  }
  if (!cleaned.every((line, idx) => idx === 1 || /^\|.*\|$/.test(line) || isMarkdownTableSeparator(line))) {
    return null;
  }
  if (!isMarkdownTableSeparator(cleaned[1])) {
    return null;
  }

  const rows = cleaned.filter((line, idx) => idx !== 1 && /^\|.*\|$/.test(line)).map(splitMarkdownTableRow);

  if (rows.length < 1) {
    return null;
  }

  return rows;
};

const parseParagraphBlocks = (content: string, toc: string[]): ParagraphBlock[] => {
  const tocKeySet = new Set(toc.map((item) => normalizeHeadingKey(item)));
  const chunks = content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  let headingIndex = 0;

  return chunks.map((chunk) => {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);

    const tableRows = parseMarkdownTable(lines);
    if (tableRows) {
      return { type: "table", rows: tableRows };
    }

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
    if (isHeadingCandidate(plainText, tocKeySet)) {
      const anchorKey = normalizeHeadingKey(plainText);
      return {
        type: "heading",
        text: plainText,
        id: `section-${headingIndex++}`,
        anchorKey,
        level: getHeadingLevel(plainText),
      };
    }

    return { type: "paragraph", text: plainText };
  });
};

export function BlogPostReader({ post, basePath, showBackLink = true, className }: BlogPostReaderProps) {
  const blocks = useMemo(() => parseParagraphBlocks(post.content, post.toc), [post.content, post.toc]);

  const tocEntries = useMemo(() => {
    const headingMap = new Map<string, string>();
    blocks.forEach((block) => {
      if (block.type === "heading" && !headingMap.has(block.anchorKey)) {
        headingMap.set(block.anchorKey, block.id);
      }
    });

    return post.toc.map((item, idx) => {
      const normalized = normalizeHeadingKey(item);
      const fallback = `section-${idx}`;
      return {
        label: cleanTocLabel(item),
        id: headingMap.get(normalized) ?? fallback,
      };
    });
  }, [blocks, post.toc]);

  const hasToc = tocEntries.length > 0;

  const scrollToAnchor = (id: string) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("grid gap-[18px]", hasToc ? "lg:grid-cols-[260px_minmax(0,1fr)]" : "grid-cols-1")}>
        {hasToc ? (
          <aside className="rounded-[12px] border border-[#d8cdb7] bg-[rgba(255,253,248,0.92)] p-[16px] lg:sticky lg:top-[0px] lg:self-start">
            <div className="flex items-center justify-between gap-[8px]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B4513]">Outline</p>
                <p className="mt-[4px] text-[15px] font-semibold text-[#121212]">目录</p>
              </div>
              <span className="rounded-[999px] border border-[rgba(26,26,26,0.10)] bg-white px-[8px] py-[2px] text-[10px] font-semibold text-app-muted">
                {tocEntries.length}
              </span>
            </div>

            <div className="mt-[14px] space-y-[6px]">
              {tocEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => scrollToAnchor(entry.id)}
                  className="block w-full rounded-[10px] border border-transparent px-[10px] py-[8px] text-left text-[12px] leading-[1.55] text-[#45413b] transition-colors hover:border-[rgba(45,80,22,0.18)] hover:bg-[rgba(45,80,22,0.05)] hover:text-[#2D5016]"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <div className="min-w-0 space-y-[18px]">
          {showBackLink ? (
            <div className="flex items-center justify-between gap-[8px]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-app-muted">MacroQuant Research</p>
              <Link href={basePath} className="text-[12px] font-semibold text-[#8B4513] hover:text-[#2D5016]">
                返回列表
              </Link>
            </div>
          ) : null}

          <header className="mx-auto max-w-[820px] text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-app-muted">{post.date}</p>
            <h1 className="mt-[10px] text-[34px] font-semibold leading-[1.18] tracking-[-0.01em] text-[#0f0f0f]">
              {post.title}
            </h1>
            <div className="mt-[12px] flex flex-wrap items-center justify-center gap-[6px]">
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

          <article className="mx-auto w-full max-w-[920px] rounded-[4px] border border-[#c8bfa8] bg-[#fffdf8] px-[24px] py-[22px] shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:px-[28px] sm:py-[26px]">
            <div className="space-y-[10px]">
              {blocks.map((block, idx) => {
                if (block.type === "heading") {
                  const headingClass =
                    block.level <= 2
                      ? "mt-[20px] mb-[8px] border-l-[3px] border-[#2D5016] bg-[rgba(45,80,22,0.05)] px-[10px] py-[7px] text-[20px] font-semibold leading-[1.38] text-[#121212]"
                      : block.level === 3
                        ? "mt-[14px] mb-[6px] border-b border-[rgba(26,26,26,0.10)] pb-[6px] text-[17px] font-semibold leading-[1.45] text-[#1b1b1b]"
                        : "mt-[10px] mb-[4px] text-[15px] font-semibold leading-[1.5] text-[#242424]";

                  return (
                    <h2
                      key={`${post.id}-h-${idx}`}
                      id={block.id}
                      className={cn("scroll-mt-[28px]", headingClass)}
                    >
                      {block.text}
                    </h2>
                  );
                }

                if (block.type === "ul") {
                  return (
                  <ul
                    key={`${post.id}-ul-${idx}`}
                    className="list-disc space-y-[6px] pl-[20px] text-[15px] leading-[1.8] text-[#1a1a1a]"
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
                      className="list-decimal space-y-[6px] pl-[20px] text-[15px] leading-[1.8] text-[#1a1a1a]"
                    >
                      {block.items.map((item, listIdx) => (
                        <li key={`${post.id}-ol-${idx}-${listIdx}`}>{item}</li>
                      ))}
                    </ol>
                  );
                }

                if (block.type === "table") {
                  const header = block.rows[0] ?? [];
                  const bodyRows = block.rows.slice(1);

                  return (
                    <div
                      key={`${post.id}-table-${idx}`}
                      className="my-[12px] overflow-x-auto rounded-[8px] border border-[#d8cdb7] bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                    >
                      <table className="min-w-full border-collapse text-left text-[13px] leading-[1.55] text-[#1f1b17]">
                        <thead className="bg-[rgba(45,80,22,0.06)]">
                          <tr>
                            {header.map((cell, cellIdx) => (
                              <th
                                key={`${post.id}-table-${idx}-h-${cellIdx}`}
                                className="border-b border-r border-[rgba(26,26,26,0.08)] px-[12px] py-[10px] font-semibold text-[#42372b] last:border-r-0"
                              >
                                {cell}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bodyRows.map((row, rowIdx) => (
                            <tr key={`${post.id}-table-${idx}-r-${rowIdx}`} className="odd:bg-white even:bg-[rgba(245,240,232,0.65)]">
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={`${post.id}-table-${idx}-r-${rowIdx}-c-${cellIdx}`}
                                  className="border-b border-r border-[rgba(26,26,26,0.06)] px-[12px] py-[10px] align-top last:border-r-0"
                                >
                                  <span className="whitespace-pre-wrap break-words">{cell}</span>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                return (
                  <p key={`${post.id}-p-${idx}`} className="text-[15px] leading-[1.85] text-[#1a1a1a]">
                    {block.text}
                  </p>
                );
              })}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
