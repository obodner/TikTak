const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'tiktak2026'
  });
}

const db = admin.firestore();

async function inspectTickets() {
  const buildingId = 'test-building';
  console.log(`--- Inspecting tickets for building: ${buildingId} ---`);
  
  const snapshot = await db.collection('buildings').doc(buildingId).collection('tickets')
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get();
    
  if (snapshot.empty) {
    console.log('No tickets found.');
    return;
  }
  
  snapshot.forEach(doc => {
    console.log(`\nTicket ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

inspectTickets().catch(console.error);
