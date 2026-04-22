const admin = require('firebase-admin');
const { writeFileSync } = require('fs');

// Initialize with project ID
admin.initializeApp({
  projectId: 'tiktak2026'
});

const db = admin.firestore();

async function migrate() {
  console.log('🚀 Starting migration: buildings -> tenants...');
  
  const buildingsSnapshot = await db.collection('buildings').get();
  
  if (buildingsSnapshot.empty) {
    console.log('❌ No buildings found to migrate.');
    return;
  }

  const batch = db.batch();
  let count = 0;

  for (const doc of buildingsSnapshot.docs) {
    const data = doc.data();
    const tenantId = doc.id;
    
    console.log(`📦 Migrating building [${tenantId}] (${data.name || 'unnamed'})...`);
    
    // 1. Prepare new tenant data with defaults
    const tenantData = {
      ...data,
      type: data.type || 'building',
      uiConfig: data.uiConfig || {
        locationLabel: 'קומה',
        subLocationLabel: 'מיקום',
        showLocation: true
      },
      updatedAt: new Date().toISOString()
    };
    
    const tenantRef = db.collection('tenants').doc(tenantId);
    batch.set(tenantRef, tenantData);
    
    // 2. Migrate tickets subcollection
    const ticketsSnapshot = await doc.ref.collection('tickets').get();
    console.log(`   └─ Found ${ticketsSnapshot.size} tickets...`);
    
    for (const ticketDoc of ticketsSnapshot.docs) {
      const ticketRef = tenantRef.collection('tickets').doc(ticketDoc.id);
      batch.set(ticketRef, ticketDoc.data());
    }
    
    count++;
  }

  console.log(`\n⏳ Committing batch for ${count} tenants...`);
  await batch.commit();
  console.log('✅ Migration complete! All buildings are now tenants.');
}

migrate().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});
