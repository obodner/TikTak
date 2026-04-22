---
description: Build and deploy to Firebase
---

---
description: Build and deploy to Firebase
---

1. Build the frontend application
   This is critical to ensure TypeScript compilation and bundling of latest changes.
```bash
cd tiktak-app/frontend
npm run build
```

2. Deploy to Firebase Hosting
   Note: We run this from the project root and specify the project alias. Consult user if he wants to deploy only rules/functions/hosting or all.
```bash
cd ..
firebase deploy --project tiktak2026
```