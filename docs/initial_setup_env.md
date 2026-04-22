# TikTak: Infrastructure Setup Guide (POC)

This document provides step-by-step instructions for provisioning the GCP infrastructure for the TikTak POC environment.

## 1. Environment Prerequisites
- **GCP Project**: A dedicated Google Cloud project (e.g., `tiktak-poc`).
- **Billing**: A linked Billing Account (required for Vertex AI and Cloud Run).
- **Tools**: `gcloud` CLI and `firebase-tools` (already installed on target machine).

## 2. Project Initialization
Set the active project context to ensure commands target the correct environment:
```powershell
gcloud auth login
gcloud config set project tiktak-2026
```

## 3. Enable Required APIs
Enable the serverless and AI services necessary for the "Snap & Send" flow:
```powershell
gcloud services enable `
    run.googleapis.com `
    firestore.googleapis.com `
    storage.googleapis.com `
    aiplatform.googleapis.com `
    cloudresourcemanager.googleapis.com
```

## 4. Database: Firestore (Native Mode)
Initialize the database in **Native Mode** in the US region:
```powershell
gcloud firestore databases create --location=us-central1 --type=native
```

## 5. Storage: Cloud Storage (GCS)
Create a bucket for high-quality compressed image uploads:
```powershell
gcloud storage buckets create gs://tiktak-2026-reports --location=us-central1
```

## 6. IAM & Security (Service Account)
Create a dedicated Service Account for the backend and assign minimum required permissions (Least Privilege):

1. **Create Service Account**:
   ```powershell
   gcloud iam service-accounts create tiktak-backend-sa --display-name="TikTak Backend Service Account"
   ```

2. **Assign Roles**:
   ```powershell
   # Firestore Access
   gcloud projects add-iam-policy-binding tiktak-2026 `
     --member="serviceAccount:tiktak-backend-sa@tiktak2026.iam.gserviceaccount.com" `
     --role="roles/datastore.user"

   # Storage Access
   gcloud projects add-iam-policy-binding tiktak-2026 `
     --member="serviceAccount:tiktak-backend-sa@tiktak2026.iam.gserviceaccount.com" `
     --role="roles/storage.objectAdmin"

   # Vertex AI Access (Gemini 2.5 Flash)
   gcloud projects add-iam-policy-binding tiktak-2026 `
     --member="serviceAccount:tiktak-backend-sa@tiktak2026.iam.gserviceaccount.com" `
     --role="roles/aiplatform.user"
   ```

## 7. Hosting: Firebase Initialization
Link the local repository to Firebase and configure the standard rewrite to Cloud Run:
```powershell
firebase init hosting
```
*Selection during init:*
- **Project**: Use the same `[PROJECT_ID]`.
- **Public directory**: `out` (for Next.js static exports) or `public`.
- **Configure as SPA**: Yes.
- **Rewrites**: We will manually update `firebase.json` later to point `/api/**` to Cloud Run.

---
## 8. Optional: Project Cleanup & Optimization
If your project has default APIs enabled (like BigQuery or App Engine), run this to keep the environment lean and focused on TikTak's "Scale-to-Zero" architecture:

```powershell
# Enable missing Core APIs
gcloud services enable run.googleapis.com aiplatform.googleapis.com

# Disable unnecessary services
gcloud services disable `
    appengine.googleapis.com `
    bigquery.googleapis.com `
    analyticshub.googleapis.com `
    bigqueryconnection.googleapis.com `
    bigquerydatapolicy.googleapis.com `
    bigquerydatatransfer.googleapis.com `
    bigquerymigration.googleapis.com `
    bigqueryreservation.googleapis.com `
    bigquerystorage.googleapis.com `
    dataform.googleapis.com `
    dataplex.googleapis.com `
    source.googleapis.com `
    sql-component.googleapis.com `
    --force
```

---
**Status**: Ready for Execution.
**Region**: `us-central1`
**Domain**: `tiktak-2026.web.app`
