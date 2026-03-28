import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({ projectId: "kiyaku-assist" });
}
const db = getFirestore();

async function main() {
  const collRef = db.collection("projects/project-1774184812325/reviewArticles");
  const snap = await collRef.get();
  console.log(`Deleting ${snap.size} reviewArticles...`);

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  console.log("Done. All ghost reviewArticles deleted.");

  // aiCache も削除
  const cacheSnap = await db.collection("aiCache").get();
  if (cacheSnap.size > 0) {
    const batch2 = db.batch();
    for (const doc of cacheSnap.docs) {
      batch2.delete(doc.ref);
    }
    await batch2.commit();
    console.log(`Deleted ${cacheSnap.size} aiCache entries.`);
  }

  // 確認
  const verifyProjects = await db.collection("projects").listDocuments();
  console.log(`Remaining project refs: ${verifyProjects.length}`);
  const verifyArticles = await collRef.get();
  console.log(`Remaining reviewArticles: ${verifyArticles.size}`);
}

main().catch(console.error);
