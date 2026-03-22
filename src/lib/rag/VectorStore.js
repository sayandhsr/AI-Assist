/**
 * VectorStore.js
 * Handles embedding storage (IndexedDB), similarity search, and retrieval.
 */

const DB_NAME = 'SpurceVectorDB';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

/**
 * Initializes the IndexedDB for vector storage.
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('docId', 'docId', { unique: false });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(new Error('IndexedDB failed to initialize.'));
  });
};

import { pipeline } from '@xenova/transformers';

let embedder = null;

/**
 * Generates an embedding for a piece of text.
 * Uses HuggingFace API if key is provided, falls back to Transformers.js.
 */
export const generateEmbedding = async (text, apiKey = null) => {
  if (apiKey) {
    try {
      const response = await fetch("https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2", {
        headers: { Authorization: `Bearer ${apiKey}` },
        method: "POST",
        body: JSON.stringify({ inputs: text }),
      });
      const result = await response.json();
      if (Array.isArray(result)) return result;
    } catch (e) {
      console.warn("HF Embedding failed, falling back to local Transformers.js.");
    }
  }

  // Fallback: Transformers.js (Local)
  try {
    if (!embedder) {
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Local embedding failed:", error);
    // Absolute Last Fallback: Mock vector (should not happen with transformers.js)
    return new Array(384).fill(0).map(() => Math.random());
  }
};

/**
 * Calculates cosine similarity between two vectors.
 */
export const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
};

/**
 * Stores chunks and their embeddings in IndexedDB.
 */
export const storeChunks = async (chunksWithEmbeddings) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  for (const item of chunksWithEmbeddings) {
    store.put(item);
  }

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};

/**
 * Searches for relevant chunks based on a query vector.
 * @param {Array} queryVector
 * @param {number} threshold
 * @param {Array<string>} validDocIds - Only search within these document IDs
 */
export const similaritySearch = async (queryVector, threshold = 0.7, validDocIds = null) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const allData = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  const results = allData
    .filter(item => !validDocIds || validDocIds.includes(item.docId))
    .map(item => ({
      ...item,
      score: cosineSimilarity(queryVector, item.embedding)
    }))
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return results;
};

/**
 * Deletes all chunks associated with a specific docId.
 */
export const deleteDocumentChunks = async (docId) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('docId');
  
  const req = index.openCursor(IDBKeyRange.only(docId));
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
};
