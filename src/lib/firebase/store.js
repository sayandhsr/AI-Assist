/**
 * store.js — Firestore Chat Persistence
 * 
 * SIMPLE: Each message = one Firestore document in "chats" collection
 * Fields: userId, role, text, createdAt
 */

import { db } from './config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  writeBatch
} from 'firebase/firestore';

/**
 * Save one message to Firestore.
 * Called immediately when user sends or AI responds.
 */
export async function saveMessageToFirestore(userId, role, text) {
  if (!userId) return;
  try {
    await addDoc(collection(db, "chats"), {
      userId: userId,
      role: role,
      text: text,
      createdAt: Date.now()
    });
    console.log("✅ Firestore: Saved", role, "message");
  } catch (error) {
    console.error("❌ Firestore save failed:", error);
  }
}

/**
 * Load all chat messages for a user from Firestore.
 * Called on app startup when user is logged in.
 * Returns array of { role, text } objects.
 */
export async function loadMessagesFromFirestore(userId) {
  if (!userId) return [];
  try {
    // Try with orderBy (requires composite index)
    const q = query(
      collection(db, "chats"),
      where("userId", "==", userId),
      orderBy("createdAt"),
      limit(50)
    );
    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      role: doc.data().role,
      text: doc.data().text
    }));
    console.log("✅ Firestore: Loaded", messages.length, "messages");
    return messages;
  } catch (error) {
    // If index error, log the link and fall back to unordered query
    console.error("❌ Firestore load error:", error);
    
    if (error.message && error.message.includes("index")) {
      console.warn("⚠️ INDEX REQUIRED: Check the browser console for a link to create the Firestore index. Click it!");
    }

    // Fallback: load without orderBy (no index needed)
    try {
      const fallbackQ = query(
        collection(db, "chats"),
        where("userId", "==", userId),
        limit(50)
      );
      const snapshot = await getDocs(fallbackQ);
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        role: doc.data().role,
        text: doc.data().text,
        _ts: doc.data().createdAt
      }));
      // Sort manually
      messages.sort((a, b) => (a._ts || 0) - (b._ts || 0));
      console.log("✅ Firestore fallback: Loaded", messages.length, "messages (unordered query)");
      return messages;
    } catch (fallbackError) {
      console.error("❌ Firestore fallback also failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Clear all messages for a user.
 */
export async function clearFirestoreMessages(userId) {
  if (!userId) return;
  try {
    const q = query(
      collection(db, "chats"),
      where("userId", "==", userId)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log("✅ Firestore: Cleared all messages");
  } catch (error) {
    console.error("❌ Firestore clear failed:", error);
  }
}
