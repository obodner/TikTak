/**
 * TikTak Super Admin Promotion Script
 * 
 * Usage:
 * 1. Download your service account key from Firebase Console
 * 2. Save it as 'service-account.json' in this directory
 * 3. Run: node promote-super-admin.mjs <USER_UID>
 */

import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

const uid = process.argv[2];

if (!uid) {
  console.error('Please provide a User UID: node promote-super-admin.mjs <UID>');
  process.exit(1);
}

async function promote() {
  try {
    const serviceAccount = JSON.parse(
      await readFile(new URL('./service-account.json', import.meta.url))
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    await admin.auth().setCustomUserClaims(uid, { role: 'super' });
    
    console.log(`Successfully promoted user ${uid} to Super Admin.`);
    console.log('The user must sign out and sign back in for the changes to take effect.');
    process.exit(0);
  } catch (err) {
    console.error('Promotion failed:', err);
    process.exit(1);
  }
}

promote();
