# Manual Deployment Guide

This guide explains how to deploy TikTak manually if the experimental `webframeworks` integration fails. This strategy uses **Cloud Run** for the Next.js frontend and **Firebase Functions** for the backend.

## Prerequisites
- Docker installed (for local container building) or Google Cloud Build enabled.
- Firebase CLI installed and logged in.
- Project ID: `tiktak2026`

---

## 1. Deploying Backend (Functions)
The backend is stable and can be deployed using the standard Firebase CLI.

```bash
cd functions
npm run build
firebase deploy --only functions --project tiktak2026
```

---

## 2. Deploying Frontend (Cloud Run)
Since the `webframeworks` integration failed to list functions, we deploy the Next.js app as a standalone container.

### Step A: Configure Standalone Build
Ensure `frontend/next.config.ts` has `output: 'standalone'`.

### Step B: Build and Push Image
```bash
cd frontend
# Build the image using Cloud Build (no local Docker needed)
gcloud builds submit --tag gcr.io/tiktak2026/frontend .
```

### Step C: Deploy to Cloud Run
```bash
gcloud run deploy tiktak-frontend \
  --image gcr.io/tiktak2026/frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## 3. Connecting Hosting to Cloud Run
Update your `firebase.json` to route all traffic to the Cloud Run service.

```json
{
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "/api/**",
        "function": { "functionId": "...", "region": "us-central1" }
      },
      {
        "source": "**",
        "run": {
          "serviceId": "tiktak-frontend",
          "region": "us-central1"
        }
      }
    ]
  }
}
```

---

## 4. Mobile Testing Guide (Snap & Send)
Once deployed, test the flow on your mobile device:

1.  **URL Format**:
    `https://tiktak-2026.web.app/he?buildingId=test-building&floor=3&resource=lobby`
2.  **QR Code**: Generate a QR code pointing to the URL above.
3.  **The Flow**:
    - **Step 1**: Scan the QR. The page should load instantly in Hebrew.
    - **Step 2**: Click the large Camera button.
    - **Step 3**: Take a photo of an issue (e.g., a paper on the floor).
    - **Step 4**: Wait for AI Analysis (3-5 seconds).
    - **Step 5**: Review the summary (e.g., "פסולת בלובי קומה 3") and Category.
    - **Step 6**: Click "שליח בוואטסאפ". It should open WhatsApp with the pre-filled message.

---

## Debugging Common Issues
- **Camera Permission**: Ensure your browser (Safari/Chrome) has camera access.
- **WhatsApp Not Opening**: Check if the `vaadPhone` exists in Firestore for that `buildingId`.
