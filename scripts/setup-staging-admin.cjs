/**
 * Bootstraps the tiktak-stg Firestore database and Super Admin account.
 * Usage:
 *   node scripts/setup-staging-admin.cjs <super-admin-email> [initial-password]
 */
const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || "tiktak-stg";
if (projectId === "tiktak2026") {
  console.error("Refusing to run staging bootstrap on production project tiktak2026!");
  process.exit(1);
}

admin.initializeApp({
  projectId,
});

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  const email = process.argv[2] || "orenb@mytiktak.com";
  const password = process.argv[3] || "TikTakStg2026!";

  console.log(`[1/3] Provisioning Super Admin (${email}) in project '${projectId}'...`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`  -> Found existing user UID: ${userRecord.uid}`);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: "Oren (Super Admin)",
        emailVerified: true,
      });
      console.log(`  -> Created new user UID: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  await auth.setCustomUserClaims(userRecord.uid, { role: "super" });
  console.log(`  -> Granted custom claim { role: 'super' } to ${email} (UID: ${userRecord.uid})`);

  console.log(`[2/3] Seeding holidays/IL and global_stats/counters in Firestore...`);
  await db.collection("holidays").doc("IL").set(
    {
      country: "IL",
      updatedAt: new Date().toISOString(),
      holidays: [
        { date: "2026-04-02", name: "Passover" },
        { date: "2026-04-08", name: "Passover VII" },
        { date: "2026-04-22", name: "Independence Day" },
        { date: "2026-05-22", name: "Shavuot" },
        { date: "2026-09-12", name: "Rosh Hashanah" },
        { date: "2026-09-21", name: "Yom Kippur" },
      ],
    },
    { merge: true }
  );

  await db.collection("global_stats").doc("counters").set(
    {
      totalTicketsCount: 0,
      ratingSum: 0,
      ratingCount: 0,
    },
    { merge: true }
  );

  console.log(`[3/3] Staging bootstrap complete!`);
}

main().catch((err) => {
  console.error("Bootstrap error:", err);
  process.exit(1);
});

