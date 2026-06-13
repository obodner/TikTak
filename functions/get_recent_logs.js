const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  console.log("Fetching recent audit logs from Firestore...");
  const logsSnap = await db.collection("audit_logs").get();
  
  const logs = [];
  logsSnap.forEach(doc => {
    logs.push({ id: doc.id, ...doc.data() });
  });

  // Sort descending by createdAt
  logs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  console.log("\n--- Top 30 Recent Logs ---");
  const top30 = logs.slice(0, 30);
  top30.forEach(log => {
    console.log(`[${log.createdAt}] [${log.level}] [${log.action || log.event}] Actor: ${log.actor?.name || log.actor?.uid}`);
    if (log.level === "ERROR" || log.action?.includes("FEEDBACK") || JSON.stringify(log).includes("error") || JSON.stringify(log).includes("Failed")) {
      console.log(JSON.stringify(log, null, 2));
    }
  });

  console.log("\n--- Searching for ALL Errors in logs ---");
  const errors = logs.filter(log => log.level === "ERROR");
  console.log(`Found ${errors.length} error logs:`);
  errors.forEach(log => {
    console.log(`[${log.createdAt}] ${log.action}: ${JSON.stringify(log.details)}`);
  });
}

run().catch(console.error);
