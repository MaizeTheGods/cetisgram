// fixIsPinned.js
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Inicializa Firebase Admin SDK
initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function addIsPinnedToAllPosts() {
  const postsRef = db.collection('posts');
  const snapshot = await postsRef.get();
  let updated = 0;

  const batch = db.batch();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.isPinned === 'undefined') {
      batch.update(doc.ref, { isPinned: false });
      updated++;
    }
  });

  if (updated > 0) {
    await batch.commit();
    console.log(`Actualizados ${updated} posts con isPinned: false`);
  } else {
    console.log('Todos los posts ya tienen el campo isPinned');
  }
}

addIsPinnedToAllPosts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error actualizando posts:', err);
    process.exit(1);
  });
