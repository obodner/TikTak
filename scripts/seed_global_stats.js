const admin = require('firebase-admin');
const fs = require('fs');

if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'tiktak2026'
  });
}

const db = admin.firestore();

async function run() {
  const docRef = db.collection('global_stats').doc('counters');
  
  // Set baseline stats: starting with 0 extra tickets, 100 ratings averaging 4.9 stars (98%)
  await docRef.set({
    totalTicketsCount: 0,
    ratingSum: 490,
    ratingCount: 100,
    updatedAt: new Date().toISOString()
  });

  console.log('Successfully seeded global_stats/counters in Firestore.');
}

run().catch(console.error);
