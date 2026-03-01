"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Mail, AlertTriangle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configured, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 認証済みならトップへリダイレクト
  if (configured && !loading && user) {
    router.replace("/");
    return null;
  }

  const handleGoogleSignIn = async () => {
    setError("");
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
      setError(`Google サインインに失敗しました: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      router.replace("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
      setError(`ログインに失敗しました: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }
    setSubmitting(true);
    try {
      await signUpWithEmail(email, password);
      router.replace("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
      setError(`新規登録に失敗しました: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoMode = () => {
    router.replace("/");
  };

  // ローディング中
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold tracking-tight">
            キヤクアシスト
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            マンション管理規約改正AIアシスタント
          </p>
        </CardHeader>

        <CardContent>
          {/* Firebase 未設定時 */}
          {!configured && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Firebase が設定されていません
                  </p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    認証を有効にするには、<code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-xs">.env.local</code> に Firebase の環境変数を設定してください。
                  </p>
                </div>
              </div>
              <Button
                className="w-full min-h-[44px]"
                variant="outline"
                onClick={handleDemoMode}
              >
                設定なしで続ける（デモモード）
              </Button>
            </div>
          )}

          {/* Firebase 設定済み時 */}
          {configured && (
            <div className="space-y-6">
              {/* Google サインイン */}
              <Button
                className="w-full min-h-[44px] text-base"
                onClick={handleGoogleSignIn}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                Google アカウントでサインイン
              </Button>

              {/* 区切り線 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    または
                  </span>
                </div>
              </div>

              {/* メール/パスワード タブ */}
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" className="min-h-[44px]">
                    ログイン
                  </TabsTrigger>
                  <TabsTrigger value="register" className="min-h-[44px]">
                    新規登録
                  </TabsTrigger>
                </TabsList>

                {/* ログインタブ */}
                <TabsContent value="login">
                  <form onSubmit={handleEmailSignIn} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">メールアドレス</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="example@mail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="min-h-[44px]"
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">パスワード</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="6文字以上"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="min-h-[44px]"
                        autoComplete="current-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full min-h-[44px]"
                      variant="secondary"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Mail className="size-4" />
                      )}
                      メールでログイン
                    </Button>
                  </form>
                </TabsContent>

                {/* 新規登録タブ */}
                <TabsContent value="register">
                  <form onSubmit={handleEmailSignUp} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="register-email">メールアドレス</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="example@mail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="min-h-[44px]"
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">パスワード</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="6文字以上"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="min-h-[44px]"
                        autoComplete="new-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full min-h-[44px]"
                      variant="secondary"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Mail className="size-4" />
                      )}
                      新規登録
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {/* エラー表示 */}
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
