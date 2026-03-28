#!/bin/bash
# gen-skill-docs.sh — スキルテンプレートから SKILL.md を生成する
#
# 使い方:
#   ./scripts/gen-skill-docs.sh              # 全スキルを再生成
#   ./scripts/gen-skill-docs.sh deploy       # deploy スキルのみ
#
# テンプレート: .claude/skills/{name}/SKILL.md.tmpl
# 出力:        .claude/skills/{name}/SKILL.md
#
# 共通パーツ（テンプレート変数）:
#   {{CLAUDE_MD_REF}}          — CLAUDE.md 参照リンク
#   {{PREAMBLE_FOOTER}}       — Preamble 末尾の共通注記
#   {{COMPLETION_STATUS}}     — 完了報告セクション
#   {{SESSION_LOG}}           — スキル使用ログ記録の案内
#
# 共通テンプレート定義: scripts/skill-template.md.tmpl

set -euo pipefail

# プロジェクトルートに移動（スクリプトの相対パス基準）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

SKILLS_DIR=".claude/skills"
SHARED_TMPL="scripts/skill-template.md.tmpl"

# ============================================================
# 共通パーツ定義
# ============================================================

CLAUDE_MD_REF='> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。'

read -r -d '' PREAMBLE_FOOTER << 'BLOCK' || true
> **注意**: Preamble のチェックでブロッカーが見つかった場合は、ワークフローを開始せず即座に **BLOCKED** または **NEEDS_CONTEXT** で報告する。
BLOCK

read -r -d '' COMPLETION_STATUS << 'BLOCK' || true
## 完了報告

実行結果を以下のいずれかで報告する:
- **DONE**: 全ステップ完了、エビデンスあり
- **DONE_WITH_CONCERNS**: 完了したが既知の問題あり（リスト提示）
- **BLOCKED**: 続行不可（ブロッカーと試行内容を提示）
- **NEEDS_CONTEXT**: 必要な情報が不足（質問を提示）
BLOCK

read -r -d '' SESSION_LOG << 'BLOCK' || true
## セッションログ

スキル実行完了後、以下でログを記録する:
```bash
./scripts/log-skill-usage.sh <skill-name> <outcome> [duration_s]
```
- outcome: success | error | abort | blocked
- ログ先: ~/.kiyaku/analytics/skill-usage.jsonl
BLOCK

# ============================================================
# 生成関数
# ============================================================

generated=0
skipped=0

generate_skill() {
    local skill_name="$1"
    local tmpl_file="${SKILLS_DIR}/${skill_name}/SKILL.md.tmpl"
    local out_file="${SKILLS_DIR}/${skill_name}/SKILL.md"

    if [ ! -f "$tmpl_file" ]; then
        echo "SKIP: ${skill_name} (SKILL.md.tmpl なし)"
        skipped=$((skipped + 1))
        return 0
    fi

    echo "GEN:  ${skill_name}"

    # 一時ファイルで段階的に置換
    local tmp_file
    tmp_file=$(mktemp)
    cp "$tmpl_file" "$tmp_file"

    # {{CLAUDE_MD_REF}} — 単一行の置換
    sed -i '' "s|{{CLAUDE_MD_REF}}|${CLAUDE_MD_REF}|g" "$tmp_file"

    # {{PREAMBLE_FOOTER}} — 複数行ブロックの置換
    _replace_block "$tmp_file" "{{PREAMBLE_FOOTER}}" "$PREAMBLE_FOOTER"

    # {{COMPLETION_STATUS}} — 複数行ブロックの置換
    _replace_block "$tmp_file" "{{COMPLETION_STATUS}}" "$COMPLETION_STATUS"

    # {{SESSION_LOG}} — 複数行ブロックの置換
    _replace_block "$tmp_file" "{{SESSION_LOG}}" "$SESSION_LOG"

    mv "$tmp_file" "$out_file"
    echo "  -> ${out_file}"
    generated=$((generated + 1))
}

# 複数行テキストでプレースホルダー行を置換するヘルパー
# $1: ファイルパス  $2: プレースホルダー文字列  $3: 置換テキスト（複数行可）
_replace_block() {
    local file="$1"
    local placeholder="$2"
    local replacement="$3"

    # プレースホルダーが含まれていなければスキップ
    if ! grep -qF "$placeholder" "$file"; then
        return 0
    fi

    # 置換テキストを一時ファイルに書き出し、sed の r コマンドで挿入
    local tmp_replacement
    tmp_replacement=$(mktemp)
    echo "$replacement" > "$tmp_replacement"

    # プレースホルダー行を削除して、その位置に置換テキストを挿入
    local tmp_out
    tmp_out=$(mktemp)
    sed -e "/^${placeholder}$/{
        r ${tmp_replacement}
        d
    }" "$file" > "$tmp_out"
    mv "$tmp_out" "$file"
    rm -f "$tmp_replacement"
}

# ============================================================
# メイン処理
# ============================================================

echo "=== スキルドキュメント生成 ==="
echo "共通テンプレート: ${SHARED_TMPL}"
echo ""

if [ $# -ge 1 ]; then
    # 指定スキルのみ
    for skill in "$@"; do
        if [ ! -d "${SKILLS_DIR}/${skill}" ]; then
            echo "ERROR: スキルディレクトリが見つかりません: ${SKILLS_DIR}/${skill}"
            exit 1
        fi
        generate_skill "$skill"
    done
else
    # 全スキル
    for skill_dir in "${SKILLS_DIR}"/*/; do
        skill_name=$(basename "$skill_dir")
        generate_skill "$skill_name"
    done
fi

echo ""
echo "--- 結果 ---"
echo "生成: ${generated} スキル"
echo "スキップ: ${skipped} スキル（テンプレートなし）"
echo ""
if [ "$generated" -gt 0 ]; then
    echo "SKILL.md を直接編集しないでください。変更は SKILL.md.tmpl を編集して再生成してください。"
fi
