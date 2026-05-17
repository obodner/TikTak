const admin = require("firebase-admin");
const fs = require("fs");

// Check for invalid GOOGLE_APPLICATION_CREDENTIALS path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "tiktak2026"
  });
}

const db = admin.firestore();

const holidaysData = {
  IL: {
    countryName: "Israel",
    holidays: [
      { date: "2026-03-03", name: "Purim" },
      { date: "2026-04-02", name: "Passover (First Day)" },
      { date: "2026-04-08", name: "Passover (Last Day)" },
      { date: "2026-04-21", name: "Independence Day" },
      { date: "2026-05-22", name: "Shavuot" },
      { date: "2026-09-12", name: "Rosh Hashanah" },
      { date: "2026-09-13", name: "Rosh Hashanah" },
      { date: "2026-09-21", name: "Yom Kippur" },
      { date: "2026-09-26", name: "Sukkot (First Day)" },
      { date: "2026-10-03", name: "Simchat Torah" }
    ]
  },
  US: {
    countryName: "USA",
    holidays: [
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
      { date: "2026-02-16", name: "Presidents' Day" },
      { date: "2026-05-25", name: "Memorial Day" },
      { date: "2026-06-19", name: "Juneteenth" },
      { date: "2026-07-04", name: "Independence Day" },
      { date: "2026-09-07", name: "Labor Day" },
      { date: "2026-10-12", name: "Columbus Day" },
      { date: "2026-11-11", name: "Veterans Day" },
      { date: "2026-11-26", name: "Thanksgiving Day" },
      { date: "2026-12-25", name: "Christmas Day" }
    ]
  }
};

async function seed() {
  console.log("🚀 Seeding global holidays...");
  for (const [code, data] of Object.entries(holidaysData)) {
    await db.collection("holidays").doc(code).set(data);
    console.log(`✅ Seeded ${data.countryName} (${code})`);
  }
  console.log("🎉 Seeding complete.");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
