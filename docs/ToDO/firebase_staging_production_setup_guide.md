# Multi-Environment Setup Guide: Firebase Staging & Production for TikTak

This guide details the complete, step-by-step procedure for configuring isolated **Staging** (Dev/QA) and **Production** environments for **TikTak**.

---

## 🎯 Architecture Decision & Strategy

Currently, TikTak uses a single Firebase project: **`tiktak2026`**.

### Recommended Approach: Keep `tiktak2026` as Production, Create `tiktak-staging`
* **Option A (Recommended):** Maintain `tiktak2026` as **Production**. Create a new project named **`tiktak-staging`** (or `tiktak-dev`).
  * *Why:* Avoids re-pointing existing web domains, SSL certificates, or existing test credentials on production.
* **Option B (Alternative):** Treat `tiktak2026` as **Staging** and create a fresh **`tiktak-prod`** for launch.
  * *Why:* Useful if `tiktak2026` contains messy seed data or temporary experimental indexes you want to leave behind.

> ⚠️ **Hard Requirement:** Multi-tenancy and tenant data isolation must be maintained per project. Never share a single Firestore database or Storage bucket between Staging and Production.

---

## 🛠️ Step 1: Create the New Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name it `tiktak-staging` (or `tiktak-prod` depending on your chosen strategy).
3. (Optional) Enable Google Analytics if desired.
4. Upgrade the new project to the **Blaze Plan** (Pay-as-you-go) so Cloud Functions (v2) and Vertex AI can run.
5. Enable the core services in the Console:
   - **Authentication:** Enable Email/Password or relevant auth providers.
   - **Firestore Database:** Create database in `nam5` (or `us-central1` to match production).
   - **Storage:** Create bucket.
   - **Functions:** Ensure Billing is linked.

---

## 🔗 Step 2: Configure Firebase Project Aliases (`.firebaserc`)

Firebase CLI natively manages multiple projects per codebase using project aliases.

### 1. Add Alias via Firebase CLI
Run the following commands in your project root:
```bash
# Add staging project alias
firebase use --add

# When prompted:
# 1. Select the newly created project (e.g. tiktak-staging)
# 2. Type "staging" as the alias name

# Add/verify production project alias
firebase use --add
# Select "tiktak2026" and type "production" as the alias name
```

### 2. Verify `.firebaserc` File
Your `.firebaserc` file should now look like this:

```json
{
  "projects": {
    "default": "tiktak2026",
    "production": "tiktak2026",
    "staging": "tiktak-staging"
  }
}
```

### 3. Quick Switch Commands
```bash
# Switch to Staging environment
firebase use staging

# Switch to Production environment
firebase use production

# Check current active environment
firebase use
```

---

## 💻 Step 3: Frontend Environment Variables & Build Configurations

The TikTak frontend is powered by Vite. Vite uses `.env` files to inject environment variables at build time based on `--mode`.

### 1. Create Environment Files in `frontend/`

#### Create `frontend/.env.staging`
```env
VITE_FIREBASE_API_KEY="AIzaSy...YOUR_STAGING_KEY"
VITE_FIREBASE_AUTH_DOMAIN="tiktak-staging.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="tiktak-staging"
VITE_FIREBASE_STORAGE_BUCKET="tiktak-staging.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="12345678901"
VITE_FIREBASE_APP_ID="1:12345678901:web:abc123def456"
VITE_ENV="staging"
```

#### Create `frontend/.env.production`
```env
VITE_FIREBASE_API_KEY="AIzaSy...YOUR_PRODUCTION_KEY"
VITE_FIREBASE_AUTH_DOMAIN="tiktak2026.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="tiktak2026"
VITE_FIREBASE_STORAGE_BUCKET="tiktak2026.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="98765432109"
VITE_FIREBASE_APP_ID="1:98765432109:web:xyz789uvw012"
VITE_ENV="production"
```

### 2. Update `frontend/package.json` Scripts
Add environment-specific build commands:

```json
"scripts": {
  "dev": "vite",
  "build:staging": "tsc && vite build --mode staging",
  "build:production": "tsc && vite build --mode production",
  "preview": "vite preview"
}
```

---

## ⚡ Step 4: Firebase Hosting & Functions Configuration (`firebase.json`)

To support multi-site or multi-project deployment in `firebase.json`:

### 1. Target Mapping for Hosting
If your Hosting site names differ between projects:
```bash
# Set hosting target for staging
firebase target:apply hosting staging tiktak-staging --project staging

# Set hosting target for production
firebase target:apply hosting production tiktak2026 --project production
```

Update `firebase.json` hosting target configuration if needed:
```json
{
  "hosting": [
    {
      "target": "staging",
      "public": "frontend/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [ ... ]
    },
    {
      "target": "production",
      "public": "frontend/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [ ... ]
    }
  ]
}
```
*(If both projects use default site hosting, target mapping is optional; `firebase use` automatically targets the active project's hosting).*

### 2. Functions Environment Variables
Inside `functions/`, create environment files for secret/config management:
* `functions/.env.staging`
* `functions/.env.production`

Example (`functions/.env.staging`):
```env
TWILIO_ACCOUNT_SID="AC_STAGING_..."
TWILIO_AUTH_TOKEN="STAGING_TOKEN_..."
GEMINI_API_KEY="AIzaSy_STAGING_KEY..."
```

---

## 🔒 Step 5: Syncing Rules and Indexes Across Environments

Security rules (`firestore.rules`, `storage.rules`) and indexes (`firestore.indexes.json`) must be kept identical across both environments to prevent bugs in production.

### Deployment Commands:

#### Deploy to Staging:
```bash
# 1. Switch to staging project
firebase use staging

# 2. Deploy rules and indexes first
firebase deploy --only firestore:rules,storage:rules,firestore:indexes

# 3. Build frontend for staging
npm --prefix frontend run build:staging

# 4. Deploy hosting and functions
firebase deploy --only functions,hosting
```

#### Deploy to Production:
```bash
# 1. Switch to production project
firebase use production

# 2. Deploy rules and indexes
firebase deploy --only firestore:rules,storage:rules,firestore:indexes

# 3. Build frontend for production
npm --prefix frontend run build:production

# 4. Deploy hosting and functions
firebase deploy --only functions,hosting
```

---

## 🤖 Step 6: Automated CI/CD Pipeline (GitHub Actions)

Automate deployments so pushes to `develop` deploy to Staging, and releases/merges to `main` deploy to Production.

### Create `.github/workflows/deploy.yml`

```yaml
name: Deploy TikTak Environments

on:
  push:
    branches:
      - main
      - develop

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install Dependencies
        run: |
          npm ci
          npm --prefix frontend ci
          npm --prefix functions ci

      - name: Build Staging Frontend
        run: npm --prefix frontend run build:staging

      - name: Deploy to Firebase Staging
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.GCP_SA_KEY_STAGING }}'
          channelId: live
          projectId: tiktak-staging

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Dependencies
        run: |
          npm ci
          npm --prefix frontend ci
          npm --prefix functions ci

      - name: Build Production Frontend
        run: npm --prefix frontend run build:production

      - name: Deploy to Firebase Production
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.GCP_SA_KEY_PRODUCTION }}'
          channelId: live
          projectId: tiktak2026
```

---

## 🛡️ Best Practices & Gotchas Checklist

- [ ] **Cross-Tenant Data Leakage:** Ensure test data created in Staging uses mock building IDs (e.g. `bld_staging_test_1`) so it never collides with real buildings.
- [ ] **Firebase Emulator Suite:** For day-to-day feature development, use local emulators (`firebase emulators:start`) before deploying to Staging.
- [ ] **CORS Settings:** Update Cloud Functions CORS origins to allow both `https://tiktak-staging.web.app` and `https://tiktak2026.web.app`.
- [ ] **Seed Data Utility:** Create a seed script (`scripts/seed-staging-db.js`) to quickly populate the Staging environment with realistic buildings and sample maintenance tickets for testing.
