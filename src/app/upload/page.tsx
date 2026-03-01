"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";

type UploadState = "idle" | "uploading" | "parsing" | "confirming";

export default function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!validTypes.includes(f.type)) {
      alert("PDF、Word (.docx)、またはテキストファイルをアップロードしてください。");
      return;
    }
    setFile(f);
    setState("uploading");

    // TODO: 実際のアップロード・パース処理
    setTimeout(() => setState("parsing"), 1500);
    setTimeout(() => setState("confirming"), 4000);
  }, []);

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

        {state === "idle" && (
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
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div className="text-4xl mb-4">📄</div>
              <p className="font-medium mb-1">
                ファイルをドラッグ&ドロップ
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                またはクリックしてファイルを選択
              </p>
              <p className="text-xs text-muted-foreground">
                対応形式: PDF, Word (.docx), テキスト (.txt)
              </p>
              <input
                id="file-input"
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {/* テキスト直接入力の代替手段 */}
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                スキャンした紙の規約しかない場合は、
                <button className="text-primary underline ml-1">
                  テキストを直接貼り付け
                </button>
              </p>
            </div>
          </>
        )}

        {(state === "uploading" || state === "parsing") && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin text-4xl mb-4">⚙️</div>
              <p className="font-medium mb-2">
                {state === "uploading" ? "アップロード中..." : "AIが条文を解析中..."}
              </p>
              <p className="text-sm text-muted-foreground">
                {file?.name}（{((file?.size ?? 0) / 1024).toFixed(0)} KB）
              </p>
              {state === "parsing" && (
                <p className="text-xs text-muted-foreground mt-4">
                  条文の構造を認識し、章・条・項に分類しています。少々お待ちください...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {state === "confirming" && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">解析結果の確認</CardTitle>
                <p className="text-sm text-muted-foreground">
                  AIが認識した規約の構造です。正しく読み取れているか確認してください。
                </p>
              </CardHeader>
              <CardContent>
                {/* デモ用のパース結果 */}
                <div className="space-y-2 text-sm">
                  {[
                    { chapter: "第1章 総則", articles: "第1条〜第6条" },
                    { chapter: "第2章 専有部分等の範囲", articles: "第7条〜第9条" },
                    { chapter: "第3章 敷地及び共用部分等の共有", articles: "第10条〜第21条" },
                    { chapter: "第4章 用法", articles: "第22条〜第24条" },
                    { chapter: "第5章 管理", articles: "第25条〜第38条" },
                    { chapter: "第6章 管理組合", articles: "第39条〜第72条" },
                    { chapter: "第7章 会計", articles: "第73条〜第80条" },
                    { chapter: "第8章 雑則", articles: "第81条〜第86条" },
                  ].map((ch) => (
                    <div
                      key={ch.chapter}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded"
                    >
                      <span className="font-medium">{ch.chapter}</span>
                      <span className="text-muted-foreground text-xs">{ch.articles}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">
                    全86条、8章構成として認識しました
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    管理組合法人の規約として判定されました
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setState("idle");
                  setFile(null);
                }}
                className="flex-1"
              >
                やり直す
              </Button>
              <Button className="flex-1" asChild>
                <Link href="/analysis">正しい — 分析を開始</Link>
              </Button>
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
