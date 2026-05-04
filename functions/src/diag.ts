import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkTenant() {
    const tenantId = 'hadar-16';
    const doc = await db.collection('tenants').doc(tenantId).get();
    if (!doc.exists) {
        console.log(`Tenant ${tenantId} NOT FOUND`);
        return;
    }
    console.log(`Tenant ${tenantId} found:`, JSON.stringify(doc.data(), null, 2));
    
    const admins = await db.collection('tenants').doc(tenantId).collection('adminUsers').get();
    console.log(`Admin users in subcollection (${admins.size}):`);
    admins.forEach(a => console.log(` - ${a.id}: ${JSON.stringify(a.data())}`));
}

checkTenant().catch(console.error);
