"use client";

/**
 * アップロードページ — 現行規約のアップロード
 *
 * テキスト入力（textarea）またはドラッグ&ドロップで管理規約を読み込み、
 * callParse() で構造化データに変換し、結果を確認してから次のステップへ進む。
 *
 * v1 からの改善点:
 * - v2 の ParseResult 型に対応（フラット articles 配列 + metadata）
 * - StepId が文字列ベースに移行
 * - import パスを v2 の @/shared/* に統一
 * - デモデータで試す機能を実装
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { callParse, callParseFile } from "@/shared/api-client";
import type { ParseResult } from "@/domains/ingestion/types";
import { saveParsedBylaws } from "@/shared/store";
import { AuthGuard } from "@/shared/auth/auth-guard";
import { cn } from "@/lib/utils";

// ---------- ファイル形式判定 ----------

/** 対応するファイル拡張子と MIME タイプ */
const SUPPORTED_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "text/plain": "テキスト",
};

/** 拡張子からファイル種別を判定する */
function getFileTypeLabel(file: File): string | null {
  // MIME タイプで判定
  if (SUPPORTED_FILE_TYPES[file.type]) return SUPPORTED_FILE_TYPES[file.type];
  // 拡張子フォールバック
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Word";
  if (ext === "txt") return "テキスト";
  return null;
}

/** ファイルがバイナリ形式（PDF/Word）かどうか */
function isBinaryFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "pdf" ||
    ext === "docx"
  );
}

// ---------- 型定義 ----------

type UploadState = "idle" | "uploading" | "parsing" | "confirming" | "error";

/** 章ごとにグルーピングされた表示用データ */
interface ChapterGroup {
  chapter: number;
  title: string;
  articleCount: number;
}

// ---------- デモデータ ----------

const DEMO_PARSE_RESULT: ParseResult = {
  articles: [
    // 第1章 総則
    ...[
      { articleNum: "第1条", title: "目的", body: "" },
      { articleNum: "第2条", title: "定義", body: "" },
      { articleNum: "第3条", title: "規約及び総会の決議の遵守義務", body: "" },
      { articleNum: "第4条", title: "対象物件の範囲", body: "" },
      { articleNum: "第5条", title: "規約及び総会の決議の効力", body: "" },
      { articleNum: "第6条", title: "管理組合", body: "" },
    ].map((a) => ({
      ...a,
      chapter: 1,
      chapterTitle: "総則",
      paragraphs: [],
    })),
    // 第2章 専有部分等の範囲
    ...[
      { articleNum: "第7条", title: "専有部分の範囲", body: "" },
      { articleNum: "第8条", title: "共用部分の範囲", body: "" },
      { articleNum: "第9条", title: "附属施設", body: "" },
    ].map((a) => ({
      ...a,
      chapter: 2,
      chapterTitle: "専有部分等の範囲",
      paragraphs: [],
    })),
    // 第3章 敷地及び共用部分等の共有
    ...Array.from({ length: 12 }, (_, i) => ({
      chapter: 3,
      chapterTitle: "敷地及び共用部分等の共有",
      articleNum: `第${10 + i}条`,
      title: `第${10 + i}条`,
      body: "",
      paragraphs: [],
    })),
    // 第4章 用法
    ...[
      { articleNum: "第22条", title: "専有部分の用途", body: "" },
      { articleNum: "第23条", title: "敷地及び共用部分等の用法", body: "" },
      { articleNum: "第24条", title: "バルコニー等の専用使用権", body: "" },
    ].map((a) => ({
      ...a,
      chapter: 4,
      chapterTitle: "用法",
      paragraphs: [],
    })),
    // 第5章 管理
    ...Array.from({ length: 14 }, (_, i) => ({
      chapter: 5,
      chapterTitle: "管理",
      articleNum: `第${25 + i}条`,
      title: `第${25 + i}条`,
      body: "",
      paragraphs: [],
    })),
    // 第6章 管理組合
    ...Array.from({ length: 34 }, (_, i) => ({
      chapter: 6,
      chapterTitle: "管理組合",
      articleNum: `第${39 + i}条`,
      title: `第${39 + i}条`,
      body: "",
      paragraphs: [],
    })),
    // 第7章 会計
    ...Array.from({ length: 8 }, (_, i) => ({
      chapter: 7,
      chapterTitle: "会計",
      articleNum: `第${73 + i}条`,
      title: `第${73 + i}条`,
      body: "",
      paragraphs: [],
    })),
    // 第8章 雑則
    ...Array.from({ length: 6 }, (_, i) => ({
      chapter: 8,
      chapterTitle: "雑則",
      articleNum: `第${81 + i}条`,
      title: `第${81 + i}条`,
      body: "",
      paragraphs: [],
    })),
  ],
  metadata: {
    totalArticles: 86,
    totalChapters: 8,
    chapterNames: [
      "総則",
      "専有部分等の範囲",
      "敷地及び共用部分等の共有",
      "用法",
      "管理",
      "管理組合",
      "会計",
      "雑則",
    ],
    parsedAt: new Date().toISOString(),
    sourceFormat: "text",
    warnings: [],
  },
};

// ---------- ヘルパー関数 ----------

/** ParseResult の articles を章ごとにグルーピングする */
function groupByChapter(result: ParseResult): ChapterGroup[] {
  const map = new Map<number, ChapterGroup>();
  for (const article of result.articles) {
    const existing = map.get(article.chapter);
    if (existing) {
      existing.articleCount++;
    } else {
      map.set(article.chapter, {
        chapter: article.chapter,
        title: article.chapterTitle,
        articleCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.chapter - b.chapter);
}

// ---------- コンポーネント ----------

export default function UploadPage() {
  return <AuthGuard><UploadPageContent /></AuthGuard>;
}

function UploadPageContent() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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

  /** ファイルアップロード（PDF/Word）→ パース結果を処理する */
  const executeParseFile = useCallback(async (f: File) => {
    setState("parsing");
    setShowDemoOption(false);
    try {
      const result = await callParseFile(f);
      setParseResult(result);
      setState("confirming");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ファイルのパース処理中にエラーが発生しました";
      setErrorMessage(message);
      setShowDemoOption(true);
      setState("error");
    }
  }, []);

  /** ファイル選択・ドロップ時のハンドラ */
  const handleFile = useCallback(
    async (f: File) => {
      const typeLabel = getFileTypeLabel(f);

      if (!typeLabel) {
        setErrorMessage(
          "対応していないファイル形式です。PDF (.pdf)、Word (.docx)、テキスト (.txt) のいずれかをアップロードしてください。",
        );
        setState("error");
        return;
      }

      setFile(f);
      setState("uploading");

      try {
        if (isBinaryFile(f)) {
          // PDF / Word はファイルアップロード API を使用
          await executeParseFile(f);
        } else {
          // テキストファイルは従来のテキスト API を使用
          const text = await f.text();
          await executeParse(text);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "ファイルの読み取りに失敗しました";
        setErrorMessage(message);
        setState("error");
      }
    },
    [executeParse, executeParseFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  /** テキスト直接入力の送信 */
  const handleDirectTextSubmit = useCallback(async () => {
    if (!directText.trim()) return;
    setState("uploading");
    await executeParse(directText.trim());
  }, [directText, executeParse]);

  /** パース結果を保存して分析画面へ遷移 */
  const handleConfirmAndProceed = useCallback(
    (result: ParseResult) => {
      saveParsedBylaws(result);
      router.push("/analysis");
    },
    [router],
  );

  /** デモデータで試す */
  const handleUseDemo = useCallback(() => {
    saveParsedBylaws(DEMO_PARSE_RESULT);
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

  /** 章グループを取得 */
  const chapterGroups = parseResult ? groupByChapter(parseResult) : [];
  const totalArticles = parseResult?.metadata.totalArticles ?? 0;

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep="upload" />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 3 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">現行規約のアップロード</h2>
          <p className="text-muted-foreground">
            お手元の管理規約をアップロードすると、AIが条文構造を自動認識します。目安:
            10分
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
                  className={cn(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
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
                    対応形式: PDF (.pdf) / Word (.docx) / テキスト (.txt)
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
                <div className="mt-6 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    スキャンした紙の規約しかない場合は、
                    <button
                      className="text-primary underline ml-1"
                      onClick={() => setShowTextInput(true)}
                    >
                      テキストを直接貼り付け
                    </button>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Google Docs の場合: メニューの「ファイル」→「ダウンロード」→「Microsoft Word (.docx)」でダウンロードしてからアップロードしてください
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
                    placeholder={"第1章　総則\n（目的）\n第1条　この規約は..."}
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
                      パース実行
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
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 animate-pulse mb-4">
                <svg
                  className="w-6 h-6 text-primary animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <p className="font-medium mb-2">
                {state === "uploading"
                  ? "ファイルを読み込み中..."
                  : "AIが条文を解析中..."}
              </p>
              {file && (
                <p className="text-sm text-muted-foreground">
                  {file.name}（{((file.size ?? 0) / 1024).toFixed(0)} KB）
                  {getFileTypeLabel(file) && (
                    <span className="ml-1 text-xs">— {getFileTypeLabel(file)}形式</span>
                  )}
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
                  {chapterGroups.map((ch) => (
                    <div
                      key={ch.chapter}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded"
                    >
                      <span className="font-medium">
                        第{ch.chapter}章 {ch.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {ch.articleCount}条
                      </span>
                    </div>
                  ))}
                </div>

                {/* 警告がある場合 */}
                {parseResult.metadata.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 font-medium mb-1">
                      注意事項
                    </p>
                    <ul className="text-xs text-amber-700 list-disc list-inside">
                      {parseResult.metadata.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">
                    全{totalArticles}条、{chapterGroups.length}
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
                次のステップへ
              </Button>
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
