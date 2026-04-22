const admin = require('firebase-admin');

// Initialize with project ID
admin.initializeApp({
  projectId: 'tiktak2026'
});

const db = admin.firestore();

async function updateRehanTenant() {
  const tenantId = 'rehan';

  // Categorization update & alphabetical sort
  const categories = [
    'אשפה ומיחזור',
    'בטחון',
    'ביוב ונזילות',
    'גינון/נוף',
    'מפגע בדרך',
    'פסולת/ניקיון',
    'תאורת רחוב',
    'אחר'
  ].sort((a, b) => a.localeCompare(b, 'he'));

  const tenantData = {
    name: 'מועצה מקומית ריחן',
    address: 'ריחן, ישראל',
    type: 'municipality',
    language: 'he',
    vaadPhone: '972522684838', // Placeholder for now
    config: {
      locations: ['שכונה צפונית', 'שכונה דרומית', 'מרכז היישוב', 'אזור התעשייה'],
      subLocations: ['רחוב הדקל', 'רחוב הזית', 'רחוב הרימון', 'רחוב הגפן'],
      categories: categories
    },
    uiConfig: {
      locationLabel: 'שכונה/רחוב',
      subLocationLabel: 'מיקום',
      showLocation: true
    },
    updatedAt: new Date().toISOString()
  };

  console.log(`🚀 Updating Municipality Tenant: [${tenantId}] (${tenantData.name})...`);
  await db.collection('tenants').doc(tenantId).update(tenantData);
  console.log('✅ Tenant updated successfully with new categories and labels!');
}

updateRehanTenant().catch(err => {
  console.error('💥 Update failed:', err);
  process.exit(1);
});
