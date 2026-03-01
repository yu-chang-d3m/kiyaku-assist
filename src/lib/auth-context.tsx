"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
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
import { isFirebaseConfigured, getFirebaseAuth } from "@/lib/firebase";

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

// ---------- Provider ----------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const signInWithEmail = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  };

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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth は AuthProvider の内側で使用してください");
  }
  return context;
}
