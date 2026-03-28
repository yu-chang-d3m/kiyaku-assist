import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({ projectId: "kiyaku-assist" });
}
const db = getFirestore();

async function main() {
  // ルートコレクション一覧
  const collections = await db.listCollections();
  console.log(`Root collections: ${collections.map(c => c.id).join(', ') || '(none)'}`);

  // aiCache コレクション確認
  const aiCache = await db.collection("aiCache").limit(3).get();
  console.log(`\naiCache docs: ${aiCache.size}`);
  for (const d of aiCache.docs) {
    console.log(`  - ${d.id}: keys=${JSON.stringify(Object.keys(d.data()))}`);
  }

  // projects コレクション
  const projects = await db.collection("projects").get();
  console.log(`\nProjects: ${projects.size} docs`);

  if (projects.size === 0) {
    // projects コレクションにドキュメントはないが、サブコレクションだけ存在する可能性
    // listDocuments() で削除済み含むドキュメント参照を取得
    const projectRefs = await db.collection("projects").listDocuments();
    console.log(`\nprojects listDocuments (includes missing): ${projectRefs.length}`);
    for (const ref of projectRefs) {
      console.log(`  - ${ref.id}`);
      const snap = await ref.get();
      console.log(`    exists: ${snap.exists}, data keys: ${snap.exists ? JSON.stringify(Object.keys(snap.data()!)) : 'N/A'}`);

      // サブコレクション確認
      const subCollections = await ref.listCollections();
      console.log(`    subcollections: ${subCollections.map(c => c.id).join(', ') || '(none)'}`);

      for (const sub of subCollections) {
        const subDocs = await sub.get();
        console.log(`    ${sub.id}: ${subDocs.size} docs`);
        const nums = subDocs.docs.slice(0, 5).map(d => d.data().articleNum);
        console.log(`      first 5 articleNums: ${nums.join(', ')}`);

        // decision の分布
        const decisions: Record<string, number> = {};
        for (const a of subDocs.docs) {
          const dec = a.data().decision ?? "null";
          decisions[dec] = (decisions[dec] ?? 0) + 1;
        }
        console.log(`      decisions: ${JSON.stringify(decisions)}`);
      }
    }
  } else {
    for (const doc of projects.docs) {
      const data = doc.data();
      console.log(`  - ${doc.id}: condoName=${data.condoName}, step=${data.currentStep}`);

      // reviewArticles サブコレクション
      const articles = await db.collection(`projects/${doc.id}/reviewArticles`).get();
      console.log(`    reviewArticles: ${articles.size} docs`);

      // 最初の5件のarticleNumを表示
      const nums = articles.docs.slice(0, 5).map(d => d.data().articleNum);
      console.log(`    first 5: ${nums.join(', ')}`);

      // decision の分布
      const decisions: Record<string, number> = {};
      for (const a of articles.docs) {
        const d = a.data().decision ?? "null";
        decisions[d] = (decisions[d] ?? 0) + 1;
      }
      console.log(`    decisions: ${JSON.stringify(decisions)}`);
    }
  }
}

main().catch(console.error);
