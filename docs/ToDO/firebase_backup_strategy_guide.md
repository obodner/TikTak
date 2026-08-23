# Comprehensive Firebase Data Backup & Disaster Recovery Guide

This step-by-step guide provides complete instructions for setting up, automating, and verifying data backups across all Google Firebase services used by **TikTak** (Cloud Firestore, Cloud Storage, Firebase Authentication, and Realtime Database).

---

## 📋 Executive Overview & Responsibility Matrix

While Google Cloud Platform (GCP) guarantees high availability and multi-zone hardware redundancy, **it does not protect against logical corruption, accidental user/developer deletion, or malicious attacks**. 

| Service | Built-in Protection | Required Action | Retention Goal |
| :--- | :--- | :--- | :--- |
| **Cloud Firestore** | Multi-zone replication | Enable PITR + Managed Scheduled Backups | 7-day microsecond PITR + 14-week daily snapshots |
| **Cloud Storage** | 99.999999999% durability | Enable Soft Delete & Object Versioning | 30-day retention for deleted objects |
| **Firebase Auth** | Account availability | Automated CLI export script | Weekly user account JSON snapshots |
| **Realtime Database** | Automatic replication | Enable Daily Automated Backups (Console) | Daily GCS JSON backups |

---

## 🗄️ Phase 1: Cloud Firestore Backup Strategy

Firestore is the primary database for TikTak (Buildings, Tickets, Users, Audits). Follow all three backup tiers below.

### Tier 1.1: Enable Point-in-Time Recovery (PITR)
PITR keeps continuous microsecond-level change logs for the past 7 days, allowing exact rollback to any point in time.

#### Setup via Google Cloud CLI (`gcloud`)
1. Open terminal and set your GCP project:
   ```bash
   gcloud config set project YOUR_FIREBASE_PROJECT_ID
   ```
2. Enable PITR on the default database:
   ```bash
   gcloud firestore databases update --database='(default)' --enable-pitr
   ```
3. Verify PITR status:
   ```bash
   gcloud firestore databases describe --database='(default)'
   ```
   *(Look for `pitrSpecification: { pitrEnabled: true }` in the output).*

#### Setup via GCP Console
1. Open the [GCP Firestore Console](https://console.cloud.google.com/firestore).
2. Go to **Databases** > Select `(default)`.
3. Click **Edit Database Settings**.
4. Check **Enable Point-in-Time Recovery (PITR)** and save.

#### How to Restore Using PITR
To restore Firestore to a specific timestamp (e.g., `2026-08-19T10:00:00Z`) without overwriting production directly, restore into a new database or export the pitr snapshot:
```bash
gcloud firestore databases restore \
  --source-database='(default)' \
  --destination-database='restored-db-temp' \
  --snapshot-time='2026-08-19T10:00:00Z'
```

---

### Tier 1.2: Configure Managed Scheduled Backups
Managed daily and weekly snapshots are stored separately from PITR and retained up to 14 weeks.

#### 1. Daily Backup Schedule (7-day retention)
Run the following command to create a daily backup schedule at midnight UTC:
```bash
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d
```

#### 2. Weekly Backup Schedule (14-week retention)
Run the following command to create a weekly backup schedule taking a snapshot every Sunday:
```bash
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=weekly \
  --day-of-week=SUN \
  --retention=14w
```

#### 3. Verify Schedules
List active backup schedules:
```bash
gcloud firestore backups schedules list --database='(default)'
```

#### How to Restore from a Scheduled Backup
1. List available backups:
   ```bash
   gcloud firestore backups list --location=nam5 # Replace with your database location
   ```
2. Restore a specific backup snapshot to a target database:
   ```bash
   gcloud firestore databases restore \
     --source-backup=projects/YOUR_PROJECT_ID/locations/YOUR_LOCATION/backups/BACKUP_ID \
     --destination-database='restored-db-target'
   ```

---

### Tier 1.3: Cold Storage Long-Term Export to Google Cloud Storage (GCS)
For permanent archiving or off-site backups, set up export jobs to Cloud Storage.

#### Step 1: Create a Dedicated Backup GCS Bucket
```bash
gcloud storage buckets create gs://YOUR_PROJECT_ID-firestore-backups \
  --location=us-central1 \
  --uniform-bucket-level-access
```

#### Step 2: Set Lifecycle Rule on Bucket (Auto-Archive/Delete)
Create a lifecycle configuration file `lifecycle.json`:
```json
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 30}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365}
    }
  ]
}
```
Apply the rule to the bucket:
```bash
gcloud storage buckets update gs://YOUR_PROJECT_ID-firestore-backups --lifecycle-file=lifecycle.json
```

#### Step 3: Grant IAM Permissions
Grant the App Engine default service account access to write to the backup bucket:
```bash
PROJECT_ID=$(gcloud config get-value project)
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}-firestore-backups \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.objectAdmin"
```

#### Step 4: Run Manual Export or Automate via Cloud Scheduler
Manual Export command:
```bash
gcloud firestore export gs://YOUR_PROJECT_ID-firestore-backups/exports/$(date +%Y%m%d_%H%M%S)
```

---

## 🪣 Phase 2: Cloud Storage for Firebase Data Protection

Cloud Storage holds resident ticket photos and document attachments. Protect it against accidental deletion and overwrites.

### 2.1 Enable Soft Delete (Recommended)
Soft Delete retains deleted objects for a defined retention period before permanent destruction.

Run the following command to enable 30-day soft delete on your primary Firebase Storage bucket:
```bash
gcloud storage buckets update gs://YOUR_PROJECT_ID.appspot.com --soft-delete-duration=30d
```

#### How to List and Restore Soft-Deleted Files
List deleted files:
```bash
gcloud storage objects list gs://YOUR_PROJECT_ID.appspot.com --soft-deleted
```
Restore a soft-deleted object:
```bash
gcloud storage objects restore gs://YOUR_PROJECT_ID.appspot.com/PATH/TO/IMAGE.jpg#GENERATION_NUMBER
```

### 2.2 Enable Object Versioning
Object versioning ensures that overwriting an existing file saves previous revisions.

Enable versioning:
```bash
gcloud storage buckets update gs://YOUR_PROJECT_ID.appspot.com --versioning
```

---

## 🔑 Phase 3: Firebase Authentication Backup & Recovery

Firebase Authentication stores user credentials and metadata. Because Auth does not feature point-in-time database snapshots in the Console, export user records periodically.

### 3.1 Manual Export via Firebase CLI
To export all user accounts into a JSON file:
```bash
npx firebase-tools auth:export users_backup_$(date +%Y%m%d).json --format=json --project=YOUR_PROJECT_ID
```

### 3.2 Automate User Account Export via Node.js Script
Create a simple utility script (`scripts/backup-auth-users.js`):

```javascript
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp();

async function exportAllUsers(nextPageToken) {
  const users = [];
  let result = await admin.auth().listUsers(1000, nextPageToken);
  users.push(...result.users);
  
  if (result.pageToken) {
    const nextUsers = await exportAllUsers(result.pageToken);
    users.push(...nextUsers);
  }
  return users;
}

async function run() {
  console.log('Starting Firebase Auth export...');
  const allUsers = await exportAllUsers();
  const filename = `auth_users_${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(allUsers, null, 2));
  console.log(`Successfully exported ${allUsers.length} users to ${filename}`);
}

run().catch(console.error);
```

### 3.3 How to Import/Restore Users
To restore exported users into an environment or project:
```bash
npx firebase-tools auth:import users_backup_20260819.json \
  --hash-algo=SCRYPT \
  --rounds=8 \
  --mem-cost=14 \
  --project=YOUR_PROJECT_ID
```

---

## ⚡ Phase 4: Firebase Realtime Database (RTDB) (If Applicable)

If your project utilizes Firebase Realtime Database:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Navigate to **Build** > **Realtime Database**.
3. Select the **Backups** tab.
4. Click **Enable Automated Backups** (Requires Blaze Plan).
5. Choose your target Google Cloud Storage bucket and retention policy (default is daily exports with 30-day GCS retention).

---

## 🧪 Phase 5: Verification & Disaster Recovery Drill Checklist

Backups are only as good as your ability to restore them. Conduct a Disaster Recovery (DR) test quarterly using this checklist:

- [ ] **Staging Isolation:** NEVER attempt a test restore directly on your production environment (`(default)` database). Always restore to a temporary or staging database name.
- [ ] **PITR Verification:** Perform a test restore of Firestore using a timestamp from 2 days ago to a database named `dr-test-pitr`.
- [ ] **Scheduled Backup Verification:** Verify that `gcloud firestore backups list` shows recent daily snapshots.
- [ ] **Storage Soft Delete Verification:** Delete a test image from Firebase Storage, verify it appears under `gcloud storage objects list --soft-deleted`, and restore it.
- [ ] **Auth Export Verification:** Confirm the generated `users_backup_YYYYMMDD.json` file is non-empty and contains valid user metadata.
- [ ] **Document Logs:** Log the recovery time objective (RTO) and recovery point objective (RPO) observed during the drill.

---

## 🚀 Quick Execution Command Cheatsheet

Run these commands right now in your terminal to secure your GCP/Firebase project:

```bash
# Set Project ID
export PROJECT_ID="your-firebase-project-id"
gcloud config set project $PROJECT_ID

# 1. Enable Firestore PITR
gcloud firestore databases update --database='(default)' --enable-pitr

# 2. Add Daily Firestore Managed Backup Schedule
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d

# 3. Add Weekly Firestore Managed Backup Schedule
gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=14w

# 4. Enable 30-Day Soft Delete on Storage Bucket
gcloud storage buckets update gs://${PROJECT_ID}.appspot.com --soft-delete-duration=30d

# 5. Enable Object Versioning on Storage Bucket
gcloud storage buckets update gs://${PROJECT_ID}.appspot.com --versioning

# 6. Run immediate manual Auth export
npx firebase-tools auth:export auth_users_initial.json --format=json --project=$PROJECT_ID
```
