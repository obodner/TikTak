const admin = require("firebase-admin");
const readline = require("readline");

const fs = require("fs");

// Check for invalid GOOGLE_APPLICATION_CREDENTIALS path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// Initialize with default credentials
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "tiktak2026"
  });
}

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("--- TikTak Tenant Creation Tool ---");

  const typeChoice = await question("Select Tenant Type (1: Building, 2: Municipality): ");
  const type = typeChoice === "1" ? "building" : (typeChoice === "2" ? "municipality" : null);

  if (!type) {
    console.error("❌ Invalid choice. Please enter 1 or 2.");
    process.exit(1);
  }

  const name = await question("Enter Tenant Name: ");
  const tenantId = await question("Enter Tenant ID: ");

  if (!name || !tenantId) {
    console.error("❌ Name and TenantID are required.");
    process.exit(1);
  }

  const buildingCategories = [
    "אשפה ומיחזור",
    "בטחון",
    "ביוב ונזילות",
    "גינון/נוף",
    "חשמל",
    "מעלית",
    "מפגע בדרך",
    "פסולת/ניקיון",
    "תאורה",
    "תחזוקה",
    "אחר"
  ];

  const muniCategories = [
    "אשפה ומיחזור",
    "בטחון",
    "ביוב ונזילות",
    "גינון/נוף",
    "חשמל",
    "מפגע בדרך",
    "פסולת/ניקיון",
    "תאורה",
    "תחזוקה",
    "אחר"
  ];

  const config = {
    categories: type === "building" ? buildingCategories : muniCategories,
    locationLabel: type === "building" ? "קומה" : "אזור",
    subLocationLabel: type === "building" ? "מיקום" : "רחוב",
    floors: [],
    resources: [],
    locations: [],
    subLocations: []
  };

  const tenantData = {
    name: name,
    type: type,
    language: "he",
    country: "IL", // Default for new tenants
    slaConfig: {
      enabled: true,
      workingDays: [0, 1, 2, 3, 4] // Default Sun-Thu
    },
    config: config,
    uiConfig: {
      locationLabel: config.locationLabel,
      subLocationLabel: config.subLocationLabel,
      showLocation: true
    },
    adminUids: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = db.collection("tenants").doc(tenantId);
    const doc = await docRef.get();

    if (doc.exists) {
      const confirm = await question(`⚠️  Tenant ID [${tenantId}] already exists. Overwrite? (y/n): `);
      if (confirm.toLowerCase() !== 'y') {
        console.log("Operation cancelled.");
        process.exit(0);
      }
    }

    await docRef.set(tenantData);

    console.log("-----------------------------------------");
    console.log(`✅ SUCCESS: Tenant [${tenantId}] created!`);
    console.log(`🏠 Name: ${name}`);
    console.log(`🏷️  Type: ${type}`);
    console.log(`📍 Labels: ${config.locationLabel} / ${config.subLocationLabel}`);
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR creating tenant:", error);
    process.exit(1);
  }
}

main();
