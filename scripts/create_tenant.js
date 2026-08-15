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
const auth = admin.auth();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("--- TikTak Single Tenant Creation Tool ---");

  const typeChoice = await question("Select Tenant Type (1: Building, 2: Municipality): ");
  let type = typeChoice === "1" ? "building" : (typeChoice === "2" ? "municipality" : null);

  if (!type) {
    console.error("❌ Invalid choice. Please enter 1 or 2.");
    process.exit(1);
  }

  let name = await question("Enter Tenant Name: ");
  let address = await question("Enter Tenant Address: ");
  let tenantId = await question("Enter Tenant ID: ");

  if (!name || !tenantId) {
    console.error("❌ Name and TenantID are required.");
    process.exit(1);
  }

  const buildingCategories = [
    "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מעלית", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
  ];

  const muniCategories = [
    "אשפה ומיחזור", "בטחון", "ביוב ונזילות", "גינון/נוף", "חשמל", "מפגע בדרך", "פסולת/ניקיון", "תאורה", "תחזוקה", "אחר"
  ];

  const tierMap = {
    "1": { tier: "starter", monthlyQuota: 15, overageRate: 12.0 },
    "2": { tier: "basic", monthlyQuota: 35, overageRate: 10.0 },
    "3": { tier: "standard", monthlyQuota: 80, overageRate: 8.0 },
    "4": { tier: "growth", monthlyQuota: 160, overageRate: 7.0 },
    "5": { tier: "enterprise", monthlyQuota: 300, overageRate: 5.5 }
  };

  console.log("\nSelect Subscription Tier:");
  console.log("1: Starter    (15 tickets/mo, ₪99/mo,  ₪12.00/overage)");
  console.log("2: Basic      (35 tickets/mo, ₪199/mo, ₪10.00/overage)");
  console.log("3: Standard   (80 tickets/mo, ₪399/mo, ₪8.00/overage)");
  console.log("4: Growth     (160 tickets/mo, ₪699/mo, ₪7.00/overage)");
  console.log("5: Enterprise (300 tickets/mo, ₪1199/mo, ₪5.50/overage)");
  const tierChoice = await question("Choice (1-5, default 1): ");
  let selectedTier = tierMap[tierChoice] || tierMap["1"];

  // Admin User Creation Option
  console.log("\n--- First Admin User Setup ---");
  const createAdminChoice = await question("Create an initial Admin User for this tenant now? (y/n, default y): ");
  let adminUserData = null;

  if (createAdminChoice.toLowerCase() !== 'n') {
    const email = await question("Admin Email: ");
    const fullName = await question("Admin Full Name (e.g. אורן בודנר): ");
    const mobile = await question("Admin Mobile Phone (e.g. 0501234567): ");
    const password = await question("Admin Password (min 6 chars): ");

    if (email && password && password.length >= 6) {
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "מנהל";
      const lastName = nameParts.slice(1).join(" ") || "";
      adminUserData = { email, fullName, firstName, lastName, mobile, password };
    }
  }

  let isConfirmed = false;
  let tenantData = null;

  while (!isConfirmed) {
    const config = {
      categories: type === "building" ? buildingCategories : muniCategories,
      locationLabel: type === "building" ? "קומה" : "אזור",
      subLocationLabel: type === "building" ? "מיקום" : "רחוב",
      floors: [], resources: [], locations: [], subLocations: []
    };

    const now = new Date();
    const startDay = now.getDate();
    
    // Calculate anniversary cycle end (1 month minus 1ms)
    const nextMonth = now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1;
    const nextYear = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const maxNextStartDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    const actualNextStartDay = Math.min(startDay, maxNextStartDay);
    const cycleEnd = new Date(Date.UTC(nextYear, nextMonth, actualNextStartDay, 0, 0, 0, 0));
    cycleEnd.setTime(cycleEnd.getTime() - 1);

    const subscription = {
      tier: selectedTier.tier,
      status: "active",
      autoRenew: true,
      monthlyQuota: selectedTier.monthlyQuota,
      overageRate: selectedTier.overageRate,
      billingCycleStartDay: startDay,
      cycleStartDate: now.toISOString(),
      cycleEndDate: cycleEnd.toISOString(),
      frozenAt: null,
      warned80PercentAt: null,
      warned100PercentAt: null,
      currentCycleTicketCount: 0,
      currentCycleExclusions: 0,
      rolloverTickets: 0
    };

    tenantData = {
      name: name,
      address: address || "",
      type: type,
      isActive: true,
      language: "he",
      country: "IL",
      subscription: subscription,
      slaConfig: {
        enabled: true,
        workingDays: [0, 1, 2, 3, 4]
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

    console.log("\n=========================================");
    console.log("   SUMMARY OF TENANT CONFIGURATION       ");
    console.log("=========================================");
    console.log(`1. 🆔 Tenant ID:     ${tenantId}`);
    console.log(`2. 🏠 Name:          ${name}`);
    console.log(`3. 📍 Address:       ${address || "N/A"}`);
    console.log(`4. 🏷️  Type:          ${type} (${config.locationLabel} / ${config.subLocationLabel})`);
    console.log(`5. 💳 Tier:          ${subscription.tier.toUpperCase()} (${subscription.monthlyQuota} tickets/mo, ₪${subscription.overageRate}/overage)`);
    if (adminUserData) {
      console.log(`6. 👤 Admin User:    ${adminUserData.fullName} (${adminUserData.email})`);
    }
    console.log("=========================================\n");

    const confirmCreate = await question("Confirm creating this tenant with the above configuration? (y/n): ");
    if (confirmCreate.toLowerCase() === 'y') {
      isConfirmed = true;
      break;
    }

    console.log("\nOptions:");
    console.log("1: Exit script");
    console.log("2: Edit parameters");
    const nextAction = await question("Choice (1-2, default 2): ");

    if (nextAction === "1") {
      console.log("❌ Tenant creation cancelled.");
      process.exit(0);
    }

    // Interactive Edit Menu
    let editing = true;
    while (editing) {
      console.log("\nSelect parameter to edit:");
      console.log(`1: Tenant ID     [Current: ${tenantId}]`);
      console.log(`2: Tenant Name   [Current: ${name}]`);
      console.log(`3: Address       [Current: ${address || "N/A"}]`);
      console.log(`4: Type          [Current: ${type}]`);
      console.log(`5: Tier          [Current: ${selectedTier.tier.toUpperCase()}]`);
      console.log("6: Done editing (Return to Summary & Confirm)");

      const paramChoice = await question("Enter choice (1-6): ");

      switch (paramChoice) {
        case "1": {
          const val = await question(`Enter new Tenant ID (press Enter to keep '${tenantId}'): `);
          if (val.trim()) tenantId = val.trim();
          break;
        }
        case "2": {
          const val = await question(`Enter new Tenant Name (press Enter to keep '${name}'): `);
          if (val.trim()) name = val.trim();
          break;
        }
        case "3": {
          const val = await question(`Enter new Address (press Enter to keep '${address}'): `);
          if (val.trim()) address = val.trim();
          break;
        }
        case "4": {
          const tVal = await question("Select Type (1: Building, 2: Municipality): ");
          if (tVal === "1") type = "building";
          else if (tVal === "2") type = "municipality";
          break;
        }
        case "5": {
          console.log("\nSelect Subscription Tier:");
          console.log("1: Starter    (15 tickets/mo, ₪99/mo,  ₪12.00/overage)");
          console.log("2: Basic      (35 tickets/mo, ₪199/mo, ₪10.00/overage)");
          console.log("3: Standard   (80 tickets/mo, ₪399/mo, ₪8.00/overage)");
          console.log("4: Growth     (160 tickets/mo, ₪699/mo, ₪7.00/overage)");
          console.log("5: Enterprise (300 tickets/mo, ₪1199/mo, ₪5.50/overage)");
          const tChoice = await question("Choice (1-5): ");
          if (tierMap[tChoice]) {
            selectedTier = tierMap[tChoice];
          }
          break;
        }
        case "6":
        default:
          editing = false;
          break;
      }
    }
  }

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

    // Provision Admin User if specified
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
        tenantData.adminUids = [adminUid];
      } catch (adminErr) {
        console.warn(`   - ⚠️ Admin user creation warning: ${adminErr.message}`);
      }
    }

    await docRef.set(tenantData);

    if (adminUid && adminUserData) {
      await docRef.collection("adminUsers").doc(adminUid).set({
        email: adminUserData.email,
        firstName: adminUserData.firstName,
        lastName: adminUserData.lastName,
        name: adminUserData.fullName,
        mobile: adminUserData.mobile,
        role: "admin",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log("-----------------------------------------");
    console.log(`✅ SUCCESS: Tenant [${tenantId}] created!`);
    console.log(`🏠 Name: ${name}`);
    console.log(`📍 Address: ${address || "N/A"}`);
    console.log(`🏷️  Type: ${type}`);
    console.log(`💳 Tier: ${selectedTier.tier.toUpperCase()} (${tenantData.subscription.monthlyQuota} tickets/mo)`);
    if (adminUserData) {
      console.log(`👤 Admin User: ${adminUserData.fullName} (${adminUserData.email})`);
    }
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR creating tenant:", error);
    process.exit(1);
  }
}

main();
