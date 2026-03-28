#!/bin/bash
# log-skill-usage.sh — スキル使用ログを記録する
#
# 使い方（スキル実行の最後に呼ぶ）:
#   ./scripts/log-skill-usage.sh <skill-name> <outcome> [duration_s]
#
# 例:
#   ./scripts/log-skill-usage.sh deploy success 45
#   ./scripts/log-skill-usage.sh run-tests error 120
#   ./scripts/log-skill-usage.sh review-pr abort
#
# ログ出力先: ~/.kiyaku/analytics/skill-usage.jsonl
# フォーマット: 1行1JSON（JSONL）

set -euo pipefail

SKILL_NAME="${1:?スキル名を指定してください}"
OUTCOME="${2:?結果を指定してください (success|error|abort|blocked)}"
DURATION_S="${3:-0}"

LOG_DIR="$HOME/.kiyaku/analytics"
LOG_FILE="${LOG_DIR}/skill-usage.jsonl"

# ログディレクトリ作成
mkdir -p "$LOG_DIR"

# タイムスタンプ
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# JSONL 形式で追記
echo "{\"skill\":\"${SKILL_NAME}\",\"outcome\":\"${OUTCOME}\",\"duration_s\":${DURATION_S},\"timestamp\":\"${TIMESTAMP}\",\"project\":\"kiyaku-assist\"}" >> "$LOG_FILE"

echo "ログ記録: ${SKILL_NAME} → ${OUTCOME} (${DURATION_S}s)"
