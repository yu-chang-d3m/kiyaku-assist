#!/bin/bash
# gen-skill-docs.sh — スキルテンプレートからSKILL.mdを生成する
#
# 使い方:
#   ./scripts/gen-skill-docs.sh [skill-name]
#   ./scripts/gen-skill-docs.sh           # 全スキルを再生成
#   ./scripts/gen-skill-docs.sh deploy    # deploy スキルのみ
#
# テンプレート: .claude/skills/{name}/SKILL.md.tmpl
# 出力:        .claude/skills/{name}/SKILL.md
#
# 共通パーツ（テンプレート変数）:
#   {{PREAMBLE}}           — Preamble Protocol セクション
#   {{COMPLETION_STATUS}}  — 完了報告セクション
#   {{CLAUDE_MD_REF}}      — CLAUDE.md 参照リンク

set -euo pipefail

SKILLS_DIR=".claude/skills"
TEMPLATES_DIR=".claude/skill-templates"

# 共通パーツ
CLAUDE_MD_REF='> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。'

COMPLETION_STATUS='## 完了報告

実行結果を以下のいずれかで報告する:
- **DONE**: 全ステップ完了、エビデンスあり
- **DONE_WITH_CONCERNS**: 完了したが既知の問題あり（リスト提示）
- **BLOCKED**: 続行不可（ブロッカーと試行内容を提示）
- **NEEDS_CONTEXT**: 必要な情報が不足（質問を提示）'

generate_skill() {
    local skill_name="$1"
    local tmpl_file="${SKILLS_DIR}/${skill_name}/SKILL.md.tmpl"
    local out_file="${SKILLS_DIR}/${skill_name}/SKILL.md"

    if [ ! -f "$tmpl_file" ]; then
        echo "SKIP: ${skill_name} (テンプレートなし)"
        return 0
    fi

    echo "GEN:  ${skill_name}"

    # テンプレート変数を置換
    sed \
        -e "s|{{CLAUDE_MD_REF}}|${CLAUDE_MD_REF}|g" \
        -e "/{{COMPLETION_STATUS}}/{
            r /dev/stdin
            d
        }" \
        "$tmpl_file" <<< "$COMPLETION_STATUS" > "$out_file"

    echo "  -> ${out_file}"
}

# メイン処理
if [ $# -eq 1 ]; then
    # 指定スキルのみ
    generate_skill "$1"
else
    # 全スキル
    for skill_dir in "${SKILLS_DIR}"/*/; do
        skill_name=$(basename "$skill_dir")
        generate_skill "$skill_name"
    done
fi

echo ""
echo "完了。テンプレートを編集した場合は再度このスクリプトを実行してください。"
echo "注意: SKILL.md を直接編集しないでください。変更は次回のテンプレート生成で上書きされます。"
