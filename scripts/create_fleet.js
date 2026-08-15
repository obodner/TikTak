const admin = require("firebase-admin");
const readline = require("readline");
const fs = require("fs");

// Check for invalid GOOGLE_APPLICATION_CREDENTIALS path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "tiktak2026"
  });
}

const db = admin.firestore();
const auth = admin.auth();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function calculateBillingCycleDates(startDay, fromDate = new Date()) {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();

  const maxStartDayInMonth = new Date(year, month + 1, 0).getDate();
  const actualStartDay = Math.min(startDay, maxStartDayInMonth);
  const cycleStart = new Date(Date.UTC(year, month, actualStartDay, 0, 0, 0, 0));

  if (fromDate < cycleStart) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const maxPrevStartDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    const actualPrevStartDay = Math.min(startDay, maxPrevStartDay);
    cycleStart.setUTCFullYear(prevYear, prevMonth, actualPrevStartDay);
  }

  const nextMonth = cycleStart.getUTCMonth() === 11 ? 0 : cycleStart.getUTCMonth() + 1;
  const nextYear = cycleStart.getUTCMonth() === 11 ? fromDate.getUTCFullYear() + 1 : cycleStart.getUTCFullYear();
  const maxNextStartDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const actualNextStartDay = Math.min(startDay, maxNextStartDay);

  const cycleEnd = new Date(Date.UTC(nextYear, nextMonth, actualNextStartDay, 0, 0, 0, 0));
  cycleEnd.setTime(cycleEnd.getTime() - 1);

  return {
    cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString()
  };
}

async function main() {
  console.log("=========================================");
  console.log("   TIKTAK MULTI-TENANT FLEET CREATOR    ");
  console.log("=========================================\n");

  console.log("Select Managed Entity Type:");
  console.log("1: Building Complex (בית משותף / מתחם מבנים)");
  console.log("2: Community / Settlement / Municipality (יישוב / קהילה / מועצה)");
  const typeChoice = await question("Choice (1-2, default 1): ");
  const entityType = typeChoice === "2" ? "municipality" : "building";
  const entityLabel = entityType === "municipality" ? "Community / Settlement" : "Building";

  const buildingCategories = [
    "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מעלית", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
  ];

  const muniCategories = [
    "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
  ];

  const selectedCategories = entityType === "municipality" ? muniCategories : buildingCategories;
  const locationLabel = entityType === "municipality" ? "אזור" : "קומה";
  const subLocationLabel = entityType === "municipality" ? "רחוב" : "מיקום";

  const tierMap = {
    "1": { tier: "starter", monthlyQuota: 15, overageRate: 12.0 },
    "2": { tier: "basic", monthlyQuota: 35, overageRate: 10.0 },
    "3": { tier: "standard", monthlyQuota: 80, overageRate: 8.0 },
    "4": { tier: "growth", monthlyQuota: 160, overageRate: 7.0 },
    "5": { tier: "enterprise", monthlyQuota: 300, overageRate: 5.5 }
  };

  console.log("\nSelect Master Pool Subscription Tier:");
  console.log("1: Starter    (15 tickets/mo)");
  console.log("2: Basic      (35 tickets/mo)");
  console.log("3: Standard   (80 tickets/mo)");
  console.log("4: Growth     (160 tickets/mo)");
  console.log("5: Enterprise (300 tickets/mo)");
  const tierChoice = await question("Choice (1-5, default 4 for Growth): ");
  const selectedTier = tierMap[tierChoice] || tierMap["4"];

  console.log("\nStructure Choice:");
  console.log(`1: ${entityLabel} #1 hosts the Master Quota Pool (No extra 3rd tenant needed)`);
  console.log(`2: Dedicated Parent Entity hosts the Master Quota Pool (Separate management tenant)`);
  const structChoice = await question("Choice (1-2, default 1): ");

  let parentName = "";
  let parentAddress = "";
  let parentId = "";
  let isParentBuilding = structChoice !== "2";

  const childBuildings = [];

  if (isParentBuilding) {
    console.log(`\n--- ${entityLabel} #1 (Master Pool Host) ---`);
    parentName = await question(`${entityLabel} #1 Name: `);
    parentAddress = await question(`${entityLabel} #1 Address: `);
    parentId = await question(`${entityLabel} #1 Tenant ID: `);

    const numChildrenStr = await question(`\nHow many ADDITIONAL child ${entityLabel.toLowerCase()}s belong to this fleet? (e.g. 1, 2, 5... default 1): `);
    const numChildren = Math.max(1, parseInt(numChildrenStr) || 1);

    for (let i = 2; i <= numChildren + 1; i++) {
      console.log(`\n--- ${entityLabel} #${i} (Pool Consumer) ---`);
      const cName = await question(`${entityLabel} #${i} Name: `);
      const cAddress = await question(`${entityLabel} #${i} Address: `);
      const cId = await question(`${entityLabel} #${i} Tenant ID: `);
      if (cName && cId) {
        childBuildings.push({ name: cName, address: cAddress, tenantId: cId });
      }
    }
  } else {
    console.log("\n--- Parent Management Entity Details ---");
    parentName = await question("Management Fleet Name: ");
    parentAddress = await question("Management Address: ");
    parentId = await question("Management Tenant ID: ");

    const numChildrenStr = await question(`\nHow many child ${entityLabel.toLowerCase()}s belong to this fleet? (e.g. 2, 3, 5... default 2): `);
    const numChildren = Math.max(1, parseInt(numChildrenStr) || 2);

    for (let i = 1; i <= numChildren; i++) {
      console.log(`\n--- Child ${entityLabel} #${i} ---`);
      const cName = await question(`${entityLabel} #${i} Name: `);
      const cAddress = await question(`${entityLabel} #${i} Address: `);
      const cId = await question(`${entityLabel} #${i} Tenant ID: `);
      if (cName && cId) {
        childBuildings.push({ name: cName, address: cAddress, tenantId: cId });
      }
    }
  }

  console.log("\n--- First Fleet Admin User Setup ---");
  const createAdmin = await question("Create an initial Admin User for this fleet now? (y/n, default y): ");
  let adminUserData = null;

  if (createAdmin.toLowerCase() !== 'n') {
    const email = await question("Admin Email: ");
    const fullName = await question("Admin Full Name (e.g. אורן בודנר): ");
    const mobile = await question("Admin Mobile Phone (e.g. 0501234567): ");
    const password = await question("Admin Initial Password (min 6 chars): ");

    if (email && password && password.length >= 6) {
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "מנהל";
      const lastName = nameParts.slice(1).join(" ") || "";
      adminUserData = { email, fullName, firstName, lastName, mobile, password };
    }
  }

  // Summary Box
  console.log("\n=========================================");
  console.log("   FLEET CONFIGURATION SUMMARY           ");
  console.log("=========================================");
  console.log(`🏷️  Managed Entity Type: ${entityType.toUpperCase()} (${entityLabel})`);
  console.log(`💳 Master Pool Tier:     ${selectedTier.tier.toUpperCase()} (${selectedTier.monthlyQuota} tickets/mo)`);
  console.log(`🏢 Master Pool Host:     ${parentName} (ID: ${parentId}) ${isParentBuilding ? `[${entityLabel} #1]` : "[Dedicated Parent Entity]"}`);
  console.log(`🏠 Child Entities (${childBuildings.length}):`);
  childBuildings.forEach((b, idx) => {
    console.log(`   ${idx + 1}. ${b.name} (ID: ${b.tenantId}) - ${b.address || "N/A"}`);
  });
  if (adminUserData) {
    console.log(`👤 Initial Admin:        ${adminUserData.fullName} (${adminUserData.email})`);
  }
  console.log("=========================================\n");

  const confirm = await question("Confirm creating this Fleet and all associated tenants? (y/n): ");
  if (confirm.toLowerCase() !== 'y') {
    console.log("❌ Fleet creation cancelled.");
    process.exit(0);
  }

  console.log("\n🚀 Creating Fleet Infrastructure...");

  const now = new Date();
  const startDay = now.getDate();
  const cycleDates = calculateBillingCycleDates(startDay, now);

  // Provision Auth User
  let adminUid = null;
  if (adminUserData) {
    try {
      try {
        const userRecord = await auth.getUserByEmail(adminUserData.email);
        adminUid = userRecord.uid;
        console.log(`   - Auth User [${adminUserData.email}] already exists. UID: ${adminUid}`);
      } catch (authNotFound) {
        const newUser = await auth.createUser({
          email: adminUserData.email,
          password: adminUserData.password,
          displayName: adminUserData.fullName
        });
        adminUid = newUser.uid;
        console.log(`   - Created Firebase Auth User [${adminUserData.email}]. UID: ${adminUid}`);
      }
    } catch (err) {
      console.warn(`   - ⚠️ Auth User creation warning: ${err.message}`);
    }
  }

  const childTenantIds = childBuildings.map(b => b.tenantId);

  // 1. Create Master Parent Tenant Document
  const parentSubscription = {
    tier: selectedTier.tier,
    status: "active",
    autoRenew: true,
    monthlyQuota: selectedTier.monthlyQuota,
    overageRate: selectedTier.overageRate,
    billingCycleStartDay: startDay,
    cycleStartDate: now.toISOString(),
    cycleEndDate: cycleDates.cycleEndDate,
    frozenAt: null,
    warned80PercentAt: null,
    warned100PercentAt: null,
    currentCycleTicketCount: 0,
    currentCycleExclusions: 0,
    rolloverTickets: 0
  };

  const parentDocData = {
    name: parentName,
    address: parentAddress || "",
    type: isParentBuilding ? entityType : "municipality",
    isActive: true,
    isPoolMaster: true,
    childTenantIds: childTenantIds,
    language: "he",
    country: "IL",
    subscription: parentSubscription,
    slaConfig: { enabled: true, workingDays: [0, 1, 2, 3, 4] },
    config: {
      categories: selectedCategories,
      locationLabel: locationLabel,
      subLocationLabel: subLocationLabel,
      floors: [], resources: [], locations: [], subLocations: []
    },
    uiConfig: { locationLabel: locationLabel, subLocationLabel: subLocationLabel, showLocation: true },
    adminUids: adminUid ? [adminUid] : [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("tenants").doc(parentId).set(parentDocData);
  console.log(`✅ Master Host Tenant [${parentId}] created!`);

  if (adminUid && adminUserData) {
    await db.collection("tenants").doc(parentId).collection("adminUsers").doc(adminUid).set({
      email: adminUserData.email,
      firstName: adminUserData.firstName,
      lastName: adminUserData.lastName,
      name: adminUserData.fullName,
      mobile: adminUserData.mobile,
      role: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // 2. Create Child Tenant Documents
  for (const bldg of childBuildings) {
    const childSubscription = {
      tier: selectedTier.tier,
      status: "active",
      autoRenew: true,
      monthlyQuota: 0, // Uses parent pool
      overageRate: selectedTier.overageRate,
      billingCycleStartDay: startDay,
      cycleStartDate: now.toISOString(),
      cycleEndDate: cycleDates.cycleEndDate,
      frozenAt: null,
      currentCycleTicketCount: 0,
      currentCycleExclusions: 0,
      rolloverTickets: 0
    };

    const childDocData = {
      name: bldg.name,
      address: bldg.address || "",
      type: entityType,
      isActive: true,
      parentEnterpriseId: parentId,
      isPoolMaster: false,
      usesParentPool: true,
      language: "he",
      country: "IL",
      subscription: childSubscription,
      slaConfig: { enabled: true, workingDays: [0, 1, 2, 3, 4] },
      config: {
        categories: selectedCategories,
        locationLabel: locationLabel,
        subLocationLabel: subLocationLabel,
        floors: [], resources: [], locations: [], subLocations: []
      },
      uiConfig: { locationLabel: locationLabel, subLocationLabel: subLocationLabel, showLocation: true },
      adminUids: adminUid ? [adminUid] : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("tenants").doc(bldg.tenantId).set(childDocData);
    console.log(`✅ Child Tenant [${bldg.tenantId}] (${bldg.name}) created & linked to Master Pool!`);

    if (adminUid && adminUserData) {
      await db.collection("tenants").doc(bldg.tenantId).collection("adminUsers").doc(adminUid).set({
        email: adminUserData.email,
        firstName: adminUserData.firstName,
        lastName: adminUserData.lastName,
        name: adminUserData.fullName,
        mobile: adminUserData.mobile,
        role: "admin",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  console.log("\n-----------------------------------------");
  console.log(`✨ SUCCESS: ${entityLabel} Fleet created for [${parentId}]!`);
  console.log(`💳 Combined Master Pool: ${selectedTier.monthlyQuota} tickets/mo (${selectedTier.tier.toUpperCase()})`);
  console.log(`🏠 Total Fleet Entities: ${childBuildings.length + 1} (${parentId} + ${childBuildings.map(b=>b.tenantId).join(", ")})`);
  console.log(`🔗 Fleet Overlook Dashboard: https://tiktak2026.web.app/admin/${parentId}/fleet`);
  console.log("-----------------------------------------");

  process.exit(0);
}

main();
