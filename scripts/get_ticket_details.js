const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  const targetId = process.argv[2] || "ccee201f-9a13-4d90-ac38-3e2095fcf767";
  console.log(`Searching for ticket ID/Ref: ${targetId} in Firestore...`);

  const tenantsSnap = await db.collection("tenants").get();
  let foundTicket = null;
  let foundTenantId = null;
  let foundTicketId = null;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    // 1. Try by document ID
    const ticketDocRef = db.collection("tenants").doc(tenantId).collection("tickets").doc(targetId);
    const ticketDoc = await ticketDocRef.get();
    if (ticketDoc.exists) {
      foundTicket = ticketDoc.data();
      foundTicketId = ticketDoc.id;
      foundTenantId = tenantId;
      console.log(`Found ticket by document ID: ${targetId} in tenant: ${tenantId}`);
      break;
    }

    // 2. Try by imageId field
    const queryImage = await db.collection("tenants").doc(tenantId).collection("tickets").where("imageId", "==", targetId).get();
    if (!queryImage.empty) {
      foundTicket = queryImage.docs[0].data();
      foundTicketId = queryImage.docs[0].id;
      foundTenantId = tenantId;
      console.log(`Found ticket by imageId: ${targetId} in tenant: ${tenantId}, ticketId: ${foundTicketId}`);
      break;
    }
    
    // 3. Try by audioId field
    const queryAudio = await db.collection("tenants").doc(tenantId).collection("tickets").where("audioId", "==", targetId).get();
    if (!queryAudio.empty) {
      foundTicket = queryAudio.docs[0].data();
      foundTicketId = queryAudio.docs[0].id;
      foundTenantId = tenantId;
      console.log(`Found ticket by audioId: ${targetId} in tenant: ${tenantId}, ticketId: ${foundTicketId}`);
      break;
    }
  }

  if (!foundTicket) {
    console.log(`Ticket with ID ${targetId} not found in any tenant's tickets collection!`);
  } else {
    console.log("\n--- Ticket Data ---");
    console.log(JSON.stringify(foundTicket, null, 2));
  }

  console.log("\nSearching audit logs for references to the target ID...");
  const logsSnap = await db.collection("audit_logs").get();
  let matchCount = 0;
  logsSnap.forEach(docSnap => {
    const data = docSnap.data();
    const str = JSON.stringify(data);
    if (str.includes(targetId) || (foundTicketId && str.includes(foundTicketId))) {
      console.log(`\n[Audit Log: ${data.createdAt}] Action: ${data.action}, Level: ${data.level}`);
      console.log(JSON.stringify(data, null, 2));
      matchCount++;
    }
  });

  console.log(`\nFinished. Found ${matchCount} matching audit log records.`);
}

run().catch(console.error);
