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
