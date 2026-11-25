// Initializes the Firebase app and exports the auth and Firestore
// service references used throughout the app.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Local test stack only (`npm run dev:local`, see .env.docker): sign in against the emulator of
// EINTER_API/docker. Never in a production build.
if (import.meta.env.DEV && import.meta.env.VITE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(auth, import.meta.env.VITE_AUTH_EMULATOR_URL);
}

// Initialize Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
