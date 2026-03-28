---
name: accessibility-guide
description: |
  キヤクアシスト v2 の高齢者向け UI 設計基準。
  WCAG 2.1 AA 準拠 + マンション理事会（高齢者が多い）向けの追加基準を提供。
  Use when: UI変更、コンポーネント追加、CSS変更、スタイル修正、
  フォント、色、ボタン、フォーム、テーブル、印刷、アクセシビリティ
---

# 高齢者向け UI 設計基準

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## このスキルの背景
キヤクアシストの主要ユーザーはマンション理事会メンバー（50-80代が中心）。
高齢者でも迷わず使えるUI設計が必須。

## 基本原則
1. **読みやすさ最優先** — フォントサイズ・コントラスト・行間
2. **操作しやすさ** — 大きなタッチターゲット、明確なフィードバック
3. **色だけに頼らない** — テキスト + 記号で情報を伝達
4. **印刷対応** — 理事会で印刷配布されることを前提

## フォント
- **フォントファミリー**: Noto Sans JP（Google Fonts）
- **本文**: 16px 以上（`text-base` 以上）
- **重要テキスト**: 18px 以上（`text-lg` 以上）
- **見出し**: 24px 以上（`text-2xl` 以上）
- **行間**: 1.75 以上（`leading-relaxed` 以上）
- **字間**: 標準（letter-spacing 調整不要）

## 色・コントラスト
- テキスト vs 背景: **4.5:1 以上**（WCAG AA）
- 大テキスト（18px以上 or 14px太字以上）: **3:1 以上**
- UIコンポーネント（ボタン境界線等）: **3:1 以上**

### 差分ハイライトの配色ルール
| 種別 | 背景色 | テキスト | 記号 | 印刷時 |
|------|--------|---------|------|--------|
| 追加 | 青系（`bg-blue-50`） | 標準 | `+` | 下線 |
| 削除 | 赤系（`bg-red-50`） | 取消線 | `-` | 取消線 |
| 修正 | 黄系（`bg-yellow-50`） | 標準 | `→` | 太字 |

## タッチターゲット・操作性
- 詳細は [references/touch-targets.md](references/touch-targets.md) 参照

## 印刷最適化
- 詳細は [references/print-optimization.md](references/print-optimization.md) 参照

## コントラスト詳細
- 詳細は [references/color-contrast.md](references/color-contrast.md) 参照
