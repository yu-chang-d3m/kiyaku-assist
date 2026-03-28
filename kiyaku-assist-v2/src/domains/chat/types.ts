/**
 * Chat ドメインの型定義
 *
 * RAG ベースのチャット Q&A と非弁ガードレールを担う。
 */

/** チャットメッセージ */
export interface ChatMessage {
  /** メッセージ ID */
  id: string;
  /** 送信者ロール */
  role: "user" | "assistant";
  /** メッセージ本文 */
  content: string;
  /** 送信日時（ISO 8601） */
  timestamp: string;
  /** 参照された資料（assistant のみ） */
  references?: ChatReference[];
  /** ガードレールによるフィルタリングが適用されたか */
  filtered?: boolean;
}

/** チャットで参照された資料 */
export interface ChatReference {
  /** 参照元の種類 */
  source: "standard_rules" | "current_rules" | "law" | "commentary";
  /** 条番号または資料名 */
  ref: string;
  /** 引用テキスト */
  excerpt: string;
}

/** チャットリクエスト */
export interface ChatRequest {
  /** プロジェクト ID */
  projectId: string;
  /** ユーザーのメッセージ */
  message: string;
  /** 会話履歴（直近 N 件） */
  history: ChatMessage[];
}

/** チャットレスポンス */
export interface ChatResponse {
  /** アシスタントのメッセージ */
  message: ChatMessage;
  /** ガードレール判定結果 */
  guardrailResult: GuardrailResult;
}

/** ガードレール判定結果 */
export interface GuardrailResult {
  /** 判定ステータス */
  status: "pass" | "warning" | "blocked";
  /** 判定理由（warning/blocked の場合） */
  reason?: string;
  /** 弁護士法72条に関連する可能性がある内容か */
  legalAdviceRisk: boolean;
}

/** RAG コンテキスト */
export interface RagContext {
  /** 検索クエリ */
  query: string;
  /** 取得されたドキュメント */
  documents: RagDocument[];
}

/** RAG で取得されたドキュメント */
export interface RagDocument {
  /** ドキュメント内容 */
  content: string;
  /** 出典 */
  source: string;
  /** 関連度スコア */
  relevanceScore: number;
}
