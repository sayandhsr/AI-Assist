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
