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
  const tenantDoc = await db.collection('tenants').doc('demo').get();
  console.log('--- TENANT DEMO CONFIG ---');
  console.log(JSON.stringify(tenantDoc.data(), null, 2));
}

run().catch(console.error);
