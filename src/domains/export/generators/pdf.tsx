import fs from "node:fs";
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
        {generatedAt ? <Text style={styles.meta}>生成日: {generatedAt}</Text> : null}
        <Text style={styles.meta}>対象条文数: {articles.length} 条</Text>
        <View style={styles.divider} />

        {chapters.map((chapter) => (
          <View key={chapter.chapter} wrap>
            <Text style={styles.chapterTitle}>
              第{chapter.chapter}章 {chapter.chapterTitle}
            </Text>

            {chapter.articles.map((article) => (
              <View key={`${chapter.chapter}-${article.articleNum}`} style={styles.articleBlock} wrap>
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
                    <Text style={styles.sectionTitle}>新旧対照表</Text>
                    <View style={styles.compareTable}>
                      <View style={styles.compareHeader}>
                        <Text style={styles.compareCell}>現行規約</Text>
                        <Text style={styles.compareCellLast}>改定案</Text>
                      </View>
                      <View style={styles.compareBody}>
                        <Text style={styles.compareCell}>{article.original}</Text>
                        <Text style={styles.compareCellLast}>{article.draft}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionTitle}>改定案（新規追加）</Text>
                    <Text style={styles.paragraph}>{article.draft}</Text>
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
              </View>
            ))}
          </View>
        ))}

        <View style={styles.divider} />
        <Text style={styles.footer}>
          ※ 本資料はキヤクアシストにより自動生成されたものです。法的助言ではありません。
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
