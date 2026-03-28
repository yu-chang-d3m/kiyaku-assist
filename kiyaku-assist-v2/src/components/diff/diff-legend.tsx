"use client";

/**
 * 差分表示の凡例コンポーネント
 *
 * 赤=削除、緑=追加をサンプル付きで表示。
 * 色覚多様性配慮: 取り消し線・下線の形状的手がかりを併用。
 */
export function DiffLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-base text-muted-foreground py-2 px-1">
      <span className="flex items-center gap-1.5">
        <span className="inline-block bg-red-100 text-red-800 line-through decoration-red-500 decoration-2 px-1.5 py-0.5 rounded-sm text-sm">
          削除例
        </span>
        <span>= 削除された部分</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block bg-emerald-100 text-emerald-800 underline decoration-emerald-500 decoration-2 px-1.5 py-0.5 rounded-sm text-sm">
          追加例
        </span>
        <span>= 追加された部分</span>
      </span>
    </div>
  );
}
