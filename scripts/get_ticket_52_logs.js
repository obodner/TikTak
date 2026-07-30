const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  console.log("Searching for ticket #52 in Firestore...");
  
  const tenantsSnap = await db.collection("tenants").get();
  let foundTicket = null;
  let foundTenantId = null;
  let foundTicketId = null;
  
  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const ticketsSnap = await db.collection("tenants").doc(tenantId).collection("tickets").where("ticketNumber", "==", 52).get();
    if (!ticketsSnap.empty) {
      foundTicket = ticketsSnap.docs[0].data();
      foundTicketId = ticketsSnap.docs[0].id;
      foundTenantId = tenantId;
      console.log(`Found Ticket #52 in tenant: ${tenantId}, ticketId: ${foundTicketId}`);
      break;
    }
  }
  
  if (!foundTicket) {
    console.log("Ticket #52 not found!");
    return;
  }
  
  console.log("\nFetching audit logs in-memory...");
  // Fetch without orderBy to avoid needing a composite index
  const logsSnap = await db.collection("audit_logs")
    .where("tenantId", "==", foundTenantId)
    .get();
  
  console.log(`Found ${logsSnap.size} total audit logs for tenant ${foundTenantId}. Filtering...`);
  const logs = [];
  logsSnap.forEach(doc => {
    logs.push(doc.data());
  });
  
  // Sort descending by createdAt
  logs.sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  
  // Take top 100
  const recentLogs = logs.slice(0, 100);
  
  recentLogs.forEach(log => {
    const isRelevant = JSON.stringify(log).includes("52") || log.level === "ERROR" || JSON.stringify(log).includes(foundTicketId);
    if (isRelevant) {
      console.log(`\n--- Log [${log.createdAt}] [${log.level}] [${log.action || log.event || "log"}] ---`);
      console.log(JSON.stringify(log, null, 2));
    }
  });
}

run().catch(console.error);
