#!/bin/bash
# log-contributor-feedback.sh — スキル品質フィードバックを Markdown 形式で記録する
#
# 使い方:
#   ./scripts/log-contributor-feedback.sh <skill> <rating> "<what_tried>" "<what_happened>" "<what_would_make_10>"
#
# 例:
#   ./scripts/log-contributor-feedback.sh deploy 8 "本番デプロイ" "正常に完了" "ロールバック手順も自動化してほしい"
#
# 引数:
#   skill              — スキル名（.claude/skills/ のディレクトリ名）
#   rating             — 評価（1-10 の整数）
#   what_tried         — 試したこと
#   what_happened      — 結果
#   what_would_make_10 — 改善案（10点にするには）
#
# ログ出力先: ~/.kiyaku/contributor-logs/YYYY-MM-DD-<skill>.md
# 制限: 1日あたり最大3件まで（同日の既存ファイル数でチェック）

set -euo pipefail

# --- 引数チェック ---
if [ $# -lt 5 ]; then
    echo "使い方: $0 <skill> <rating> \"<what_tried>\" \"<what_happened>\" \"<what_would_make_10>\""
    echo ""
    echo "例:"
    echo "  $0 deploy 8 \"本番デプロイ\" \"正常に完了\" \"ロールバック手順も自動化してほしい\""
    exit 1
fi

SKILL="$1"
RATING="$2"
WHAT_TRIED="$3"
WHAT_HAPPENED="$4"
WHAT_WOULD_MAKE_10="$5"

# --- バリデーション ---

# rating が 1-10 の整数であることを確認
if ! [[ "$RATING" =~ ^[0-9]+$ ]] || [ "$RATING" -lt 1 ] || [ "$RATING" -gt 10 ]; then
    echo "ERROR: rating は 1〜10 の整数を指定してください: ${RATING}"
    exit 1
fi

# --- セッション上限チェック（1日最大3件） ---
LOG_DIR="$HOME/.kiyaku/contributor-logs"
mkdir -p "$LOG_DIR"

TODAY=$(date +"%Y-%m-%d")
EXISTING_COUNT=$(find "$LOG_DIR" -maxdepth 1 -name "${TODAY}-*.md" 2>/dev/null | wc -l | tr -d ' ')

if [ "$EXISTING_COUNT" -ge 3 ]; then
    echo "ERROR: 本日のフィードバック上限（3件）に達しています"
    echo "  既存ファイル数: ${EXISTING_COUNT}"
    exit 1
fi

# --- VERSION 読み取り ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="${PROJECT_ROOT}/VERSION"

if [ -f "$VERSION_FILE" ]; then
    VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
    VERSION="unknown"
fi

# --- タイムスタンプ ---
DATETIME=$(date +"%Y-%m-%d %H:%M:%S")

# --- ログファイル名（重複回避のためカウンタ付き） ---
NEXT_INDEX=$((EXISTING_COUNT + 1))
LOG_FILE="${LOG_DIR}/${TODAY}-${SKILL}.md"

# 同じスキル名で同日に複数ある場合はサフィックス付与
if [ -f "$LOG_FILE" ]; then
    LOG_FILE="${LOG_DIR}/${TODAY}-${SKILL}-${NEXT_INDEX}.md"
fi

# --- Markdown 出力 ---
cat > "$LOG_FILE" <<FEEDBACK
# ${SKILL} フィードバック

**試したこと:** ${WHAT_TRIED}

**結果:** ${WHAT_HAPPENED}

**評価:** ${RATING}/10

## 改善案

${WHAT_WOULD_MAKE_10}

**日時:** ${DATETIME}

**バージョン:** ${VERSION}

**スキル:** /${SKILL}
FEEDBACK

echo "フィードバック記録: ${LOG_FILE}"
echo "  スキル: /${SKILL} | 評価: ${RATING}/10 | 日時: ${DATETIME}"
