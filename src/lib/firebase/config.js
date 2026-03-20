/**
 * config.js
 * Firebase initialization and configuration.
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDJnqJWT3KZGFFGrOpAoGet4MGR-rkeZgM",
  authDomain: "ai-assist-71419.firebaseapp.com",
  projectId: "ai-assist-71419",
  storageBucket: "ai-assist-71419.firebasestorage.app",
  messagingSenderId: "464781504285",
  appId: "1:464781504285:web:85e62465044b793eba7bf4",
  measurementId: "G-9DDEXTRGMW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// OpenRouter & HF Config
export const AI_CONFIG = {
  OPENROUTER_KEY: "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",
  HF_KEY: "" 
};
