import admin from 'firebase-admin';
import fs from 'fs';

// Check for invalid GOOGLE_APPLICATION_CREDENTIALS path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  console.warn(`⚠️  Invalid GOOGLE_APPLICATION_CREDENTIALS path detected. Unsetting for this session.`);
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'tiktak2026',
    storageBucket: 'tiktak2026.firebasestorage.app'
  });
}

const bucket = admin.storage().bucket();

/**
 * OPTION 1: Set Automated Lifecycle Rule (Recommended)
 * This tells Google Cloud to automatically delete any file older than 365 days.
 */
async function setLifecycleRule() {
  console.log("🚀 Configuring Automated Lifecycle Rule (365 days)...");
  try {
    await bucket.setMetadata({
      lifecycle: {
        rule: [
          {
            action: { type: 'Delete' },
            condition: { age: 365 } // Days
          }
        ]
      }
    });
    console.log("✅ Automated 1-year retention policy is now ACTIVE.");
  } catch (err) {
    console.error("❌ Failed to set lifecycle rule:", err);
  }
}

/**
 * OPTION 2: Manual Cleanup (One-time)
 * This manually iterates and deletes files older than 1 year.
 */
async function manualCleanup() {
  console.log("🔍 Starting manual cleanup of files older than 1 year...");
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  try {
    const [files] = await bucket.getFiles();
    let deleteCount = 0;

    for (const file of files) {
      const createdAt = new Date(file.metadata.timeCreated);
      if (createdAt < oneYearAgo) {
        console.log(`   - Deleting old file: ${file.name} (Created: ${file.metadata.timeCreated})`);
        await file.delete();
        deleteCount++;
      }
    }

    console.log(`✨ Manual cleanup complete. Deleted ${deleteCount} files.`);
  } catch (err) {
    console.error("❌ Manual cleanup failed:", err);
  }
}

// Default action: Set the lifecycle rule (The "Scale-to-Zero" way)
setLifecycleRule().then(() => {
  // If you also want to run a manual cleanup now:
  // return manualCleanup();
}).catch(console.error);
