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
    projectId: "tiktak2026",
    storageBucket: "tiktak2026.firebasestorage.app" // Ensure this matches your bucket
  });
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("--- ⚠️  TikTak Tenant DELETION Tool ⚠️  ---");
  console.log("This will PERMANENTLY delete:");
  console.log("1. All Firestore documents (Tenant + Tickets + Users + Logs)");
  console.log("2. All Storage files (Images + Audio)");
  console.log("3. All associated Firebase Authentication users");
  console.log("-----------------------------------------");

  const tenantId = await question("Enter Tenant ID to DELETE: ");

  if (!tenantId) {
    console.error("❌ TenantID is required.");
    process.exit(1);
  }

  try {
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      console.error(`❌ Tenant ID [${tenantId}] not found in Firestore.`);
      process.exit(1);
    }

    const tData = tenantDoc.data();
    console.log(`🔍 Found Tenant: ${tData.name} (${tData.type})`);

    const confirmId = await question(`❗ CONFIRMATION: Type the Tenant ID [${tenantId}] to proceed: `);
    if (confirmId !== tenantId) {
      console.log("❌ Confirmation mismatch. Operation cancelled.");
      process.exit(0);
    }

    const finalWarning = await question(`⚠️  ARE YOU ABSOLUTELY SURE? This cannot be undone. (yes/no): `);
    if (finalWarning.toLowerCase() !== 'yes') {
      console.log("Operation cancelled.");
      process.exit(0);
    }

    console.log(`\n🚀 Starting deletion for [${tenantId}]...`);

    // 1. Delete Auth Users
    console.log("Step 1: Deleting Firebase Authentication users...");
    const adminUsersSnap = await tenantRef.collection("adminUsers").get();
    const uids = adminUsersSnap.docs.map(doc => doc.id);
    
    if (uids.length > 0) {
      for (const uid of uids) {
        try {
          await auth.deleteUser(uid);
          console.log(`   - Deleted user: ${uid}`);
        } catch (e) {
          if (e.code === 'auth/user-not-found') {
            console.log(`   - User ${uid} already deleted from Auth.`);
          } else {
            console.warn(`   - ⚠️  Failed to delete user ${uid}: ${e.message}`);
          }
        }
      }
    } else {
      console.log("   - No users found to delete.");
    }

    // 2. Delete Storage Files
    console.log("Step 2: Deleting Storage files...");
    const bucket = storage.bucket();
    const prefix = `tenants/${tenantId}/`;
    try {
      await bucket.deleteFiles({ prefix });
      console.log(`   - Deleted all files under gs://${bucket.name}/${prefix}`);
    } catch (e) {
      console.warn(`   - ⚠️  Storage deletion failed: ${e.message}`);
    }

    // 3. Delete Audit Logs (from top-level collection)
    console.log("Step 3: Deleting global audit logs...");
    try {
      const logsSnap = await db.collection("audit_logs")
        .where("tenantId", "==", tenantId)
        .get();
      
      const metadataLogsSnap = await db.collection("audit_logs")
        .where("metadata.tenantId", "==", tenantId)
        .get();

      const allLogDocs = [...logsSnap.docs, ...metadataLogsSnap.docs];
      if (allLogDocs.length > 0) {
        const batch = db.batch();
        allLogDocs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`   - Deleted ${allLogDocs.length} audit log records.`);
      } else {
        console.log("   - No audit logs found.");
      }
    } catch (e) {
      console.warn(`   - ⚠️  Audit log deletion failed: ${e.message}`);
    }

    // 4. Delete Firestore Documents (Recursive)
    console.log("Step 4: Deleting Firestore documents (recursive)...");
    try {
      await db.recursiveDelete(tenantRef);
      console.log(`   - Deleted tenant document and all subcollections.`);
    } catch (e) {
      console.error(`   - ❌ Firestore recursive delete failed: ${e.message}`);
      throw e;
    }

    console.log("-----------------------------------------");
    console.log(`✨ SUCCESS: Tenant [${tenantId}] has been completely removed.`);
    console.log("-----------------------------------------");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ CRITICAL ERROR during deletion:", error);
    process.exit(1);
  }
}

main();
