"use client";

import { useMemo } from "react";
import { diffChars } from "diff";

interface InlineDiffProps {
  oldText: string;
  newText: string;
}

/**
 * インライン差分表示コンポーネント
 *
 * diff ライブラリの diffChars を使い、文字単位で差分を計算。
 * 削除部分: 赤背景 + 取り消し線
 * 追加部分: 緑背景 + 下線
 * 中高年向け: text-base (16px)、高コントラスト、色＋形状の二重手がかり
 */
export function InlineDiff({ oldText, newText }: InlineDiffProps) {
  const parts = useMemo(() => diffChars(oldText, newText), [oldText, newText]);

  return (
    <div className="text-base leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.removed) {
          return (
            <span
              key={i}
              className="bg-red-100 text-red-800 line-through decoration-red-500 decoration-2 px-0.5 rounded-sm"
              aria-label="削除された部分"
            >
              {part.value}
            </span>
          );
        }
        if (part.added) {
          return (
            <span
              key={i}
              className="bg-emerald-100 text-emerald-800 underline decoration-emerald-500 decoration-2 px-0.5 rounded-sm"
              aria-label="追加された部分"
            >
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}
