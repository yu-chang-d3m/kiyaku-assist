"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { callParse, type ParseResult, type ParsedChapter } from "@/lib/api";
import { saveParsedBylaws } from "@/lib/session-store";

type UploadState = "idle" | "uploading" | "parsing" | "confirming" | "error";

// デモ用のフォールバックデータ
const DEMO_DATA: ParseResult = {
  chapters: [
    {
      chapter: 1,
      title: "総則",
      articles: [
        { articleNum: "1", title: "目的", content: "" },
        { articleNum: "2", title: "定義", content: "" },
        { articleNum: "3", title: "規約及び総会の決議の遵守義務", content: "" },
        { articleNum: "4", title: "対象物件の範囲", content: "" },
        { articleNum: "5", title: "規約及び総会の決議の効力", content: "" },
        { articleNum: "6", title: "管理組合", content: "" },
      ],
    },
    {
      chapter: 2,
      title: "専有部分等の範囲",
      articles: [
        { articleNum: "7", title: "専有部分の範囲", content: "" },
        { articleNum: "8", title: "共用部分の範囲", content: "" },
        { articleNum: "9", title: "附属施設", content: "" },
      ],
    },
    {
      chapter: 3,
      title: "敷地及び共用部分等の共有",
      articles: Array.from({ length: 12 }, (_, i) => ({
        articleNum: String(10 + i),
        title: `第${10 + i}条`,
        content: "",
      })),
    },
    {
      chapter: 4,
      title: "用法",
      articles: [
        { articleNum: "22", title: "専有部分の用途", content: "" },
        { articleNum: "23", title: "敷地及び共用部分等の用法", content: "" },
        { articleNum: "24", title: "バルコニー等の専用使用権", content: "" },
      ],
    },
    {
      chapter: 5,
      title: "管理",
      articles: Array.from({ length: 14 }, (_, i) => ({
        articleNum: String(25 + i),
        title: `第${25 + i}条`,
        content: "",
      })),
    },
    {
      chapter: 6,
      title: "管理組合",
      articles: Array.from({ length: 34 }, (_, i) => ({
        articleNum: String(39 + i),
        title: `第${39 + i}条`,
        content: "",
      })),
    },
    {
      chapter: 7,
      title: "会計",
      articles: Array.from({ length: 8 }, (_, i) => ({
        articleNum: String(73 + i),
        title: `第${73 + i}条`,
        content: "",
      })),
    },
    {
      chapter: 8,
      title: "雑則",
      articles: Array.from({ length: 6 }, (_, i) => ({
        articleNum: String(81 + i),
        title: `第${81 + i}条`,
        content: "",
      })),
    },
  ],
};

export default function UploadPage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [directText, setDirectText] = useState("");
  const [showDemoOption, setShowDemoOption] = useState(false);

  /** callParse を呼び出してパース結果を処理する共通関数 */
  const executeParse = useCallback(async (text: string) => {
    setState("parsing");
    setShowDemoOption(false);
    try {
      const result = await callParse(text);
      setParseResult(result);
      setState("confirming");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "パース処理中にエラーが発生しました";
      setErrorMessage(message);
      setShowDemoOption(true);
      setState("error");
    }
  }, []);

  /** ファイル選択・ドロップ時のハンドラ */
  const handleFile = useCallback(
    async (f: File) => {
      // PDF / Word はテキスト形式へ誘導
      if (
        f.type === "application/pdf" ||
        f.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        setErrorMessage(
          "現在はテキスト形式 (.txt) のみ対応しています。PDFやWordファイルはテキスト形式に変換してからアップロードしてください。"
        );
        setState("error");
        return;
      }

      // テキストファイル以外を弾く
      if (f.type !== "text/plain" && !f.name.endsWith(".txt")) {
        setErrorMessage(
          "対応していないファイル形式です。テキストファイル (.txt) をアップロードしてください。"
        );
        setState("error");
        return;
      }

      setFile(f);
      setState("uploading");

      try {
        const text = await f.text();
        await executeParse(text);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "ファイルの読み取りに失敗しました";
        setErrorMessage(message);
        setState("error");
      }
    },
    [executeParse]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  /** テキスト直接入力の送信 */
  const handleDirectTextSubmit = useCallback(async () => {
    if (!directText.trim()) return;
    setState("uploading");
    // uploading は一瞬で終わり、parsing へ
    await executeParse(directText.trim());
  }, [directText, executeParse]);

  /** パース結果を保存して分析画面へ遷移 */
  const handleConfirmAndProceed = useCallback(
    (result: ParseResult) => {
      saveParsedBylaws(result);
      router.push("/analysis");
    },
    [router]
  );

  /** デモデータで試す */
  const handleUseDemo = useCallback(() => {
    saveParsedBylaws(DEMO_DATA);
    router.push("/analysis");
  }, [router]);

  /** やり直し */
  const handleReset = useCallback(() => {
    setState("idle");
    setFile(null);
    setErrorMessage("");
    setParseResult(null);
    setShowTextInput(false);
    setDirectText("");
    setShowDemoOption(false);
  }, []);

  /** 総条文数を計算 */
  const totalArticles = parseResult
    ? parseResult.chapters.reduce((sum, ch) => sum + ch.articles.length, 0)
    : 0;

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={2} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 2 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">現行規約のアップロード</h2>
          <p className="text-muted-foreground">
            お手元の管理規約をアップロードすると、AIが条文構造を自動認識します。目安: 10分
          </p>
        </div>

        {/* 注意喚起 */}
        <div className="p-3 bg-muted rounded-lg mb-6 text-sm">
          <p className="font-medium">アップロード対象</p>
          <p className="text-muted-foreground text-xs mt-1">
            管理規約・使用細則のみをアップロードしてください。組合員名簿・議事録等の個人情報を含む文書は対象外です。
          </p>
        </div>

        {/* ---- idle: ファイル選択 / テキスト入力 ---- */}
        {state === "idle" && (
          <>
            {!showTextInput ? (
              <>
                {/* ドロップゾーン */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() =>
                    document.getElementById("file-input")?.click()
                  }
                >
                  <div className="text-4xl mb-4">📄</div>
                  <p className="font-medium mb-1">
                    ファイルをドラッグ&ドロップ
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    またはクリックしてファイルを選択
                  </p>
                  <p className="text-xs text-muted-foreground">
                    対応形式: テキスト (.txt)　※ PDF / Word は今後対応予定
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    accept=".txt,.pdf,.docx"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>

                {/* テキスト直接入力の代替手段 */}
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    スキャンした紙の規約しかない場合は、
                    <button
                      className="text-primary underline ml-1"
                      onClick={() => setShowTextInput(true)}
                    >
                      テキストを直接貼り付け
                    </button>
                  </p>
                </div>
              </>
            ) : (
              /* テキスト直接入力エリア */
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">テキストを直接入力</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    管理規約の全文をコピー&ペーストしてください。
                  </p>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={directText}
                    onChange={(e) => setDirectText(e.target.value)}
                    placeholder="第1章　総則&#10;（目的）&#10;第1条　この規約は..."
                    className="w-full h-64 p-3 border rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-3 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowTextInput(false);
                        setDirectText("");
                      }}
                      className="flex-1"
                    >
                      戻る
                    </Button>
                    <Button
                      onClick={handleDirectTextSubmit}
                      disabled={!directText.trim()}
                      className="flex-1"
                    >
                      送信して解析
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ---- uploading / parsing: 処理中表示 ---- */}
        {(state === "uploading" || state === "parsing") && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin text-4xl mb-4">⚙️</div>
              <p className="font-medium mb-2">
                {state === "uploading"
                  ? "ファイルを読み込み中..."
                  : "AIが条文を解析中..."}
              </p>
              {file && (
                <p className="text-sm text-muted-foreground">
                  {file.name}（{((file.size ?? 0) / 1024).toFixed(0)} KB）
                </p>
              )}
              {state === "parsing" && (
                <p className="text-xs text-muted-foreground mt-4">
                  条文の構造を認識し、章・条・項に分類しています。少々お待ちください...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- error: エラー表示 ---- */}
        {state === "error" && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">⚠️</div>
                <p className="font-medium text-destructive mb-2">
                  エラーが発生しました
                </p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>

              <div className="flex flex-col gap-3 mt-6">
                <Button onClick={handleReset} variant="outline">
                  やり直す
                </Button>
                {showDemoOption && (
                  <Button onClick={handleUseDemo} variant="secondary">
                    デモデータで試す
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- confirming: パース結果表示 ---- */}
        {state === "confirming" && parseResult && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">解析結果の確認</CardTitle>
                <p className="text-sm text-muted-foreground">
                  AIが認識した規約の構造です。正しく読み取れているか確認してください。
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {parseResult.chapters.map((ch: ParsedChapter) => (
                    <div
                      key={ch.chapter}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded"
                    >
                      <span className="font-medium">
                        第{ch.chapter}章 {ch.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {ch.articles.length}条
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">
                    全{totalArticles}条、{parseResult.chapters.length}
                    章構成として認識しました
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1"
              >
                やり直す
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleConfirmAndProceed(parseResult)}
              >
                正しい — 分析を開始
              </Button>
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
