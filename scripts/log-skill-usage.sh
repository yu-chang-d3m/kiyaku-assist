#!/bin/bash
# log-skill-usage.sh — スキル使用ログを JSONL 形式で記録する
#
# 使い方:
#   ./scripts/log-skill-usage.sh <skill-name> <outcome> [duration_s]
#
# 例:
#   ./scripts/log-skill-usage.sh deploy success 45
#   ./scripts/log-skill-usage.sh run-tests error 120
#   ./scripts/log-skill-usage.sh review-pr abort
#
# 引数:
#   skill-name  — スキル名（.claude/skills/ のディレクトリ名）
#   outcome     — 結果: success | error | abort | blocked
#   duration_s  — 実行時間（秒）、省略時は 0
#
# ログ出力先: ~/.kiyaku/analytics/skill-usage.jsonl
# フォーマット: 1行1JSON（JSONL）
# フィールド: skill, outcome, duration_s, timestamp, project

set -euo pipefail

# --- 引数チェック ---
if [ $# -lt 2 ]; then
    echo "使い方: $0 <skill-name> <outcome> [duration_s]"
    echo "  outcome: success | error | abort | blocked"
    exit 1
fi

SKILL_NAME="$1"
OUTCOME="$2"
DURATION_S="${3:-0}"

# outcome のバリデーション
case "$OUTCOME" in
    success|error|abort|blocked) ;;
    *)
        echo "ERROR: outcome は success / error / abort / blocked のいずれかを指定してください"
        echo "  指定された値: ${OUTCOME}"
        exit 1
        ;;
esac

# duration_s が数値であることを確認
if ! [[ "$DURATION_S" =~ ^[0-9]+$ ]]; then
    echo "ERROR: duration_s は整数を指定してください: ${DURATION_S}"
    exit 1
fi

# --- ログ出力 ---
LOG_DIR="$HOME/.kiyaku/analytics"
LOG_FILE="${LOG_DIR}/skill-usage.jsonl"

# ディレクトリがなければ作成
mkdir -p "$LOG_DIR"

# ISO 8601 タイムスタンプ（UTC）
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# プロジェクト名（リポジトリのディレクトリ名から取得）
PROJECT="kiyaku-assist"

# JSONL 形式で追記
echo "{\"skill\":\"${SKILL_NAME}\",\"outcome\":\"${OUTCOME}\",\"duration_s\":${DURATION_S},\"timestamp\":\"${TIMESTAMP}\",\"project\":\"${PROJECT}\"}" >> "$LOG_FILE"

echo "ログ記録: ${SKILL_NAME} -> ${OUTCOME} (${DURATION_S}s) @ ${TIMESTAMP}"
