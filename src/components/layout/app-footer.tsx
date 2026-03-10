/**
 * アプリケーション共通フッター
 *
 * AI 出力に関する免責事項を表示する。
 * Server Component として動作（状態やイベントハンドラ不要）。
 */
export function AppFooter() {
  return (
    <footer className="border-t mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <p className="text-xs text-muted-foreground text-center">
          AIの出力はあくまで参考情報であり法的助言ではありません。採用前に専門家の確認を推奨します。
        </p>
      </div>
    </footer>
  );
}
