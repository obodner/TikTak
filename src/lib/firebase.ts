import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "tiktak2026",
  appId: "1:100013179958:web:991f5121f6669fee8b0497",
  storageBucket: "tiktak2026.firebasestorage.app",
  apiKey: "AIzaSyBmySHUfCo0buZhGEsWzTf7Cy30OU-iMqs",
  authDomain: "tiktak2026.firebaseapp.com",
  messagingSenderId: "100013179958",
  measurementId: "G-GWQQY72T7Z"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
