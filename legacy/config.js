// config.js
// IMPORTANT SECURITY NOTE: 
// In a real production application, do NOT hardcode API keys here.
// Provide these via secure environment variables injected at build time.
// This configuration is for local prototyping and development purposes.

export const CONFIG = {
    // ----------------------------------------------------
    // OpenRouter API Configuration
    // Get a free key at: https://openrouter.ai/
    // ----------------------------------------------------
    OPENROUTER_API_KEY: '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',
    AI_MODEL: 'google/gemini-2.0-flash-exp:free',

    // ----------------------------------------------------
    // Firebase Configuration (for Auth & Firestore)
    // Create a project at: https://console.firebase.google.com/
    // ----------------------------------------------------
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyDJnqJWT3KZGFFGrOpAoGet4MGR-rkeZgM",
        authDomain: "ai-assist-71419.firebaseapp.com",
        projectId: "ai-assist-71419",
        storageBucket: "ai-assist-71419.firebasestorage.app",
        messagingSenderId: "464781504285",
        appId: "1:464781504285:web:85e62465044b793eba7bf4",
        measurementId: "G-9DDEXTRGMW"
    }
};
