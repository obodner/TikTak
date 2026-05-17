const admin = require("firebase-admin");
const fs = require("fs");

// Check for invalid GOOGLE_APPLICATION_CREDENTIALS path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "tiktak2026"
  });
}

const db = admin.firestore();

async function updateTenants() {
  console.log("🚀 Updating existing tenants with SLA config...");
  const tenantsSnap = await db.collection("tenants").get();
  
  const batch = db.batch();
  tenantsSnap.forEach(doc => {
    const data = doc.data();
    const update = {};
    
    if (!data.country) {
      update.country = "IL";
    }
    
    if (!data.slaConfig) {
      update.slaConfig = {
        enabled: true,
        workingDays: [0, 1, 2, 3, 4] // Sun-Thu
      };
    }
    
    if (Object.keys(update).length > 0) {
      batch.update(doc.ref, update);
      console.log(`📝 Prepared update for ${doc.id}`);
    }
  });

  await batch.commit();
  console.log("🎉 All tenants updated.");
  process.exit(0);
}

updateTenants().catch(err => {
  console.error("❌ Update failed:", err);
  process.exit(1);
});
