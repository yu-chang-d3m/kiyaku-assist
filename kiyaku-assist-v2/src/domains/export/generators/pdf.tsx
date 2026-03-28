import fs from "node:fs";
import { diffChars } from "diff";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  ExportArticle,
  ExportGenerator,
  ExportOptions,
  ExportResult,
} from "@/domains/export/types";
import {
  applyExportFilter,
  getDecisionLabel,
  getImportanceLabel,
  groupExportArticlesByChapter,
} from "@/domains/export/presentation";

const PDF_FONT_FAMILY = "ExportJapanese";
const PDF_FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  "/Library/Fonts/Arial Unicode.ttf",
  "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf",
].filter((path): path is string => Boolean(path));

let fontRegistered = false;

// ---------- 差分ハイライト用スタイル ----------

const diffStyles = StyleSheet.create({
  removed: {
    color: "#991b1b",
    backgroundColor: "#fecaca",
    textDecoration: "line-through",
  },
  added: {
    color: "#166534",
    backgroundColor: "#dcfce7",
    textDecoration: "underline",
  },
  legendBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 8,
    color: "#4b5563",
  },
  legendContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    backgroundColor: "#f9fafb",
  },
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    lineHeight: 1.5,
    color: "#111827",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  meta: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    marginVertical: 12,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 8,
  },
  articleBlock: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  },
  articleTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  metaTable: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  metaLabel: {
    width: "24%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: "#f3f4f6",
    fontWeight: 700,
  },
  metaValue: {
    width: "76%",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 6,
  },
  compareTable: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginBottom: 8,
  },
  compareHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  compareBody: {
    flexDirection: "row",
  },
  compareCell: {
    width: "50%",
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
  },
  compareCellLast: {
    width: "50%",
    padding: 8,
  },
  paragraphLabel: {
    fontWeight: 700,
  },
  paragraph: {
    marginBottom: 6,
  },
  footer: {
    marginTop: 8,
    fontSize: 8,
    color: "#4b5563",
  },
});

/** Google Fonts CDN フォールバック（Cloud Run 等ローカルフォントがない環境用） */
const NOTO_SANS_JP_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";

function ensurePdfFontRegistered(): void {
  if (fontRegistered) return;

  const fontPath = PDF_FONT_CANDIDATES.find((candidate) =>
    fs.existsSync(candidate),
  );

  if (fontPath) {
    Font.register({
      family: PDF_FONT_FAMILY,
      src: fontPath,
    });
  } else {
    // ローカルフォントが見つからない場合は CDN からダウンロード
    Font.register({
      family: PDF_FONT_FAMILY,
      src: NOTO_SANS_JP_URL,
    });
  }

  fontRegistered = true;
}

function formatDate(options: ExportOptions): string | null {
  if (!options.includeTimestamp) return null;
  return new Date().toLocaleDateString("ja-JP");
}

// ---------- 差分ハイライトコンポーネント ----------

/**
 * 現行規約セル用の差分テキスト
 *
 * 削除された部分を赤背景+取り消し線でハイライトする。
 * 追加された部分は表示しない（改定案側に表示される）。
 */
function OriginalDiffText({
  original,
  draft,
}: {
  original: string;
  draft: string;
}) {
  const parts = diffChars(original, draft);

  return (
    <Text style={styles.compareCell}>
      {parts.map((part, i) => {
        if (part.added) return null;
        if (part.removed) {
          return (
            <Text key={i} style={diffStyles.removed}>
              {part.value}
            </Text>
          );
        }
        return <Text key={i}>{part.value}</Text>;
      })}
    </Text>
  );
}

/**
 * 改定案セル用の差分テキスト
 *
 * 追加された部分を緑背景+下線でハイライトする。
 * 削除された部分は表示しない（現行規約側に表示される）。
 */
function DraftDiffText({
  original,
  draft,
}: {
  original: string;
  draft: string;
}) {
  const parts = diffChars(original, draft);

  return (
    <Text style={styles.compareCellLast}>
      {parts.map((part, i) => {
        if (part.removed) return null;
        if (part.added) {
          return (
            <Text key={i} style={diffStyles.added}>
              {part.value}
            </Text>
          );
        }
        return <Text key={i}>{part.value}</Text>;
      })}
    </Text>
  );
}

/** 差分の凡例 */
function DiffLegend() {
  return (
    <View style={diffStyles.legendContainer}>
      <View style={diffStyles.legendBox}>
        <View
          style={[diffStyles.legendSwatch, { backgroundColor: "#fecaca" }]}
        />
        <Text style={diffStyles.legendLabel}>削除（取り消し線）</Text>
      </View>
      <View style={diffStyles.legendBox}>
        <View
          style={[diffStyles.legendSwatch, { backgroundColor: "#dcfce7" }]}
        />
        <Text style={diffStyles.legendLabel}>追加（下線）</Text>
      </View>
      <View style={diffStyles.legendBox}>
        <View
          style={[
            diffStyles.legendSwatch,
            { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d1d5db" },
          ]}
        />
        <Text style={diffStyles.legendLabel}>変更なし</Text>
      </View>
    </View>
  );
}

// ---------- PDF ドキュメント ----------

function PdfDocument({
  articles,
  options,
}: {
  articles: ExportArticle[];
  options: ExportOptions;
}) {
  const chapters = groupExportArticlesByChapter(articles);
  const generatedAt = formatDate(options);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{options.condoName} 管理規約改定案</Text>
        {generatedAt ? (
          <Text style={styles.meta}>生成日: {generatedAt}</Text>
        ) : null}
        <Text style={styles.meta}>対象条文数: {articles.length} 条</Text>

        <View style={styles.divider} />

        {/* 差分の凡例 */}
        <DiffLegend />

        {chapters.map((chapter) => (
          <View key={chapter.chapter} wrap>
            <Text style={styles.chapterTitle}>
              第{chapter.chapter}章 {chapter.chapterTitle}
            </Text>

            {chapter.articles.map((article) => (
              <View
                key={`${chapter.chapter}-${article.articleNum}`}
                style={styles.articleBlock}
                wrap
              >
                <Text style={styles.articleTitle}>{article.articleNum}</Text>

                <View style={styles.metaTable}>
                  {[
                    ["重要度", getImportanceLabel(article.importance)],
                    ["判定", getDecisionLabel(article.decision)],
                    ["準拠", article.baseRef],
                  ].map(([label, value], index, rows) => (
                    <View
                      key={`${article.articleNum}-${label}`}
                      style={
                        index === rows.length - 1
                          ? [styles.metaRow, { borderBottomWidth: 0 }]
                          : styles.metaRow
                      }
                    >
                      <Text style={styles.metaLabel}>{label}</Text>
                      <Text style={styles.metaValue}>{value}</Text>
                    </View>
                  ))}
                </View>

                {article.original ? (
                  <View>
                    <Text style={styles.sectionTitle}>
                      新旧対照表（変更箇所ハイライト）
                    </Text>
                    <View style={styles.compareTable}>
                      <View style={styles.compareHeader}>
                        <Text style={styles.compareCell}>現行規約</Text>
                        <Text style={styles.compareCellLast}>改定案</Text>
                      </View>
                      <View style={styles.compareBody}>
                        <OriginalDiffText
                          original={article.original}
                          draft={article.draft}
                        />
                        <DraftDiffText
                          original={article.original}
                          draft={article.draft}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionTitle}>
                      改定案（新規追加）
                    </Text>
                    <Text
                      style={[styles.paragraph, diffStyles.added]}
                    >
                      {article.draft}
                    </Text>
                  </View>
                )}

                <Text style={styles.paragraph}>
                  <Text style={styles.paragraphLabel}>要約: </Text>
                  {article.summary}
                </Text>
                <Text style={styles.paragraph}>
                  <Text style={styles.paragraphLabel}>解説: </Text>
                  {article.explanation}
                </Text>

                {/* 判断支援情報 */}
                {(article.impactOnResidents || article.riskIfUnchanged || article.transitionalMeasure || article.standardRuleComparison || (article.relatedLawRefs && article.relatedLawRefs.length > 0)) && (
                  <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e5e7eb" }}>
                    <Text style={[styles.sectionTitle, { fontSize: 9 }]}>判断支援情報</Text>
                    {article.impactOnResidents ? (
                      <Text style={[styles.paragraph, { fontSize: 9 }]}>
                        <Text style={styles.paragraphLabel}>住民生活への影響: </Text>
                        {article.impactOnResidents}
                      </Text>
                    ) : null}
                    {article.riskIfUnchanged ? (
                      <Text style={[styles.paragraph, { fontSize: 9 }]}>
                        <Text style={styles.paragraphLabel}>変更しなかった場合のリスク: </Text>
                        {article.riskIfUnchanged}
                      </Text>
                    ) : null}
                    {article.transitionalMeasure ? (
                      <Text style={[styles.paragraph, { fontSize: 9 }]}>
                        <Text style={styles.paragraphLabel}>経過措置: </Text>
                        {article.transitionalMeasure}
                      </Text>
                    ) : null}
                    {article.standardRuleComparison ? (
                      <Text style={[styles.paragraph, { fontSize: 9 }]}>
                        <Text style={styles.paragraphLabel}>標準管理規約との対比: </Text>
                        {article.standardRuleComparison}
                      </Text>
                    ) : null}
                    {article.relatedLawRefs && article.relatedLawRefs.length > 0 ? (
                      <Text style={[styles.paragraph, { fontSize: 9 }]}>
                        <Text style={styles.paragraphLabel}>根拠法令: </Text>
                        {article.relatedLawRefs.join("、")}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.footer}>
          ※ 本資料は規約リノベにより自動生成されたものです。法的助言ではありません。
        </Text>
        <Text style={styles.footer}>
          ※ 最終的な規約案の決定にあたっては、マンション管理士や弁護士等の専門家にご相談ください。
        </Text>
      </Page>
    </Document>
  );
}

export class PdfGenerator implements ExportGenerator {
  async generate(
    articles: ExportArticle[],
    options: ExportOptions,
  ): Promise<ExportResult> {
    ensurePdfFontRegistered();

    const filtered = applyExportFilter(articles, options.filter);
    const content = await renderToBuffer(
      <PdfDocument articles={filtered} options={options} />,
    );
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content,
      filename: `${options.condoName}_規約改定案_${timestamp}.pdf`,
      mimeType: "application/pdf",
      articleCount: filtered.length,
    };
  }
}
