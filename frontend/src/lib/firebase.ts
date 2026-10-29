import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tiktak2026",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:100013179958:web:991f5121f6669fee8b0497",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tiktak2026.firebasestorage.app",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBmySHUfCo0buZhGEsWzTf7Cy30OU-iMqs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tiktak2026.firebaseapp.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "100013179958",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-GWQQY72T7Z"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

