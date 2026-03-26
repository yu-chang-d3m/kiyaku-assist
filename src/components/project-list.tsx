"use client";

/**
 * プロジェクト一覧コンポーネント
 *
 * ログイン済みユーザーのプロジェクトを表示し、
 * 再開・削除の操作を提供する。
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/shared/auth/auth-context";
import { listProjects, deleteProjectApi } from "@/shared/api-client";
import { clearSession, saveProjectId } from "@/shared/store";
import type { Project } from "@/shared/db/types";
import { JOURNEY_STEPS, getStepIdByIndex } from "@/shared/journey";
import { Trash2 } from "lucide-react";

export function ProjectList() {
  const { user, configured } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !user) return;
    setLoading(true);
    listProjects(user.uid)
      .then((p) => setProjects(p))
      .catch((e) => console.error("プロジェクト取得エラー:", e))
      .finally(() => setLoading(false));
  }, [user, configured]);

  async function handleDelete(project: Project) {
    if (!project.id) return;
    if (
      !confirm(
        `「${project.condoName}」のプロジェクトを削除しますか？\nこの操作は取り消せません。分析結果やドラフトも全て削除されます。`,
      )
    )
      return;

    setDeleting(project.id);
    try {
      await deleteProjectApi(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      // セッションストアもクリア
      clearSession();
    } catch (err) {
      console.error("削除エラー:", err);
      alert("削除に失敗しました: " + (err instanceof Error ? err.message : "不明なエラー"));
    } finally {
      setDeleting(null);
    }
  }

  function handleResume(project: Project) {
    if (!project.id) return;
    saveProjectId(project.id);
  }

  if (!configured || !user) return null;
  if (loading) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">プロジェクトを読み込み中...</p>
      </div>
    );
  }
  if (projects.length === 0) return null;

  /** currentStep（数値）から表示ラベルとパスを解決する */
  function resolveStep(stepIndex: number) {
    const stepId = getStepIdByIndex(stepIndex);
    const step = stepId ? JOURNEY_STEPS.find((s) => s.id === stepId) : undefined;
    return {
      label: step?.label ?? `ステップ ${stepIndex}`,
      path: step?.path ?? "/onboarding",
    };
  }

  return (
    <section className="max-w-5xl mx-auto px-4 py-8">
      <h3 className="text-lg font-semibold mb-4">あなたのプロジェクト</h3>
      <div className="space-y-3">
        {projects.map((project) => {
          const pid = project.id ?? "";
          const step = project.currentStep ?? 0;
          const { label, path } = resolveStep(step);
          return (
            <Card key={pid}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{project.condoName}</p>
                  <p className="text-xs text-muted-foreground">
                    進捗: {label}（{step + 1} / {JOURNEY_STEPS.length}）
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    asChild
                    onClick={() => handleResume(project)}
                  >
                    <Link href={path}>再開</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(project)}
                    disabled={deleting === pid}
                  >
                    {deleting === pid ? (
                      <span className="text-xs">削除中...</span>
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
