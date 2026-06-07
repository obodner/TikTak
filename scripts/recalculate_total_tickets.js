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
  console.log('Counting actual tickets in Firestore...');
  
  // Get all tenants first to count tickets sequentially and avoid COLLECTION_GROUP index requirements if possible
  const tenantsSnap = await db.collection('tenants').get();
  let totalCount = 0;
  
  for (const tenantDoc of tenantsSnap.docs) {
    const ticketsSnap = await tenantDoc.ref.collection('tickets').get();
    totalCount += ticketsSnap.size;
  }

  console.log(`Found actual total tickets: ${totalCount}`);

  const docRef = db.collection('global_stats').doc('counters');
  await docRef.update({
    totalTicketsCount: totalCount
  });

  console.log(`Updated totalTicketsCount in global_stats/counters to: ${totalCount}`);
}

run().catch(console.error);
