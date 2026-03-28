"use client";

/**
 * 認証コンテキスト
 *
 * Firebase Authentication の状態を React Context で管理する。
 *
 * v1 からの改善点:
 * - 'use client' ディレクティブを明示
 * - Firebase 未設定時のデモモード（isFirebaseConfigured フラグ）
 * - エラーハンドリングの強化（各認証メソッドでエラーを再 throw）
 * - 型安全性の向上（AuthContextValue の明示的な型定義）
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { isFirebaseConfigured, getFirebaseAuth } from "@/shared/db/firestore";

// ---------- 型定義 ----------

interface AuthContextValue {
  /** 現在の認証ユーザー（未認証時は null） */
  user: User | null;
  /** 認証状態の読み込み中フラグ */
  loading: boolean;
  /** Firebase が設定済みかどうか */
  configured: boolean;
  /** Google アカウントでサインイン */
  signInWithGoogle: () => Promise<void>;
  /** メール・パスワードでサインイン */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** メール・パスワードで新規登録 */
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** サインアウト */
  signOut: () => Promise<void>;
}

// ---------- Context ----------

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------- Google プロバイダ（再利用） ----------

const googleProvider = new GoogleAuthProvider();

// ---------- Provider ----------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Firebase 設定済みの場合のみ初期ローディング（未設定時は即座に完了）
  const [loading, setLoading] = useState(isFirebaseConfigured);

  // Firebase Auth の状態を監視（設定済みの場合のみ）
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // --- 認証メソッド ---

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured) {
      console.warn("[AuthContext] Firebase 未設定: signInWithGoogle はスキップされました");
      return;
    }
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!isFirebaseConfigured) {
      console.warn("[AuthContext] Firebase 未設定: signInWithEmail はスキップされました");
      return;
    }
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!isFirebaseConfigured) {
      console.warn("[AuthContext] Firebase 未設定: signUpWithEmail はスキップされました");
      return;
    }
    const auth = getFirebaseAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    if (!isFirebaseConfigured) {
      console.warn("[AuthContext] Firebase 未設定: signOut はスキップされました");
      return;
    }
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        configured: isFirebaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------- Hook ----------

/**
 * 認証コンテキストにアクセスするカスタムフック
 *
 * AuthProvider の内側でのみ使用可能。
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth は AuthProvider の内側で使用してください");
  }
  return context;
}
