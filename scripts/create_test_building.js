const admin = require("firebase-admin");

// Initialize with default credentials (or local environment if authenticated via CLI)
admin.initializeApp({
  projectId: "tiktak2026"
});

const db = admin.firestore();

async function createTestBuilding() {
  const buildingId = "test-building";
  const userUid = process.argv[2] || "insert-your-uid-here";

  console.log(`Configuring building: ${buildingId} for UID: ${userUid}`);

  const config = {
    floors: ["0", "1", "2", "3"],
    resources: ["לובי", "חדר מדרגות", "מעלית", "חניון"],
    categories: ["חשמל", "אינסטלציה", "מעלית", "ניקיון", "בטיחות", "תחזוקה", "גינון", "אחר"]
  };

  const buildingData = {
    name: "TikTak HQ Test",
    address: "Herzl Street 1, Tel Aviv",
    vaadPhone: "00972522684838",
    language: "he",
    config: config,
    adminUids: [userUid],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = db.collection("buildings").doc(buildingId);
    // Use merge: false to wipe old top-level fields (floors, resources, categories) from the root
    await docRef.set(buildingData, { merge: false });
    
    console.log("-----------------------------------------");
    console.log(`✅ SUCCESS: Building ${buildingId} is ready!`);
    console.log(`🔍 LANGUAGE: Hebrew (he)`);
    console.log(`🔍 PERMISSION: Admin UID [${userUid}] is now authorized.`);
    console.log("-----------------------------------------");
    
    if (userUid === "insert-your-uid-here") {
      console.warn("⚠️  WARNING: No UID provided. Use: node scripts/create_test_building.js YOUR_UID");
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR configuring building:", error);
    process.exit(1);
  }
}

createTestBuilding();
