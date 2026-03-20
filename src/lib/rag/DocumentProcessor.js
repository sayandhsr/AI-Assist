/**
 * DocumentProcessor.js
 * Handles text extraction from PDF, DOCX, and TXT files.
 */

import * as pdfjsLib from 'pdfjs-dist';
// Import worker matching the version of pdfjs-dist
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import mammoth from 'mammoth';

// Initialize PDF.js worker using Vite's URL asset
if (typeof window !== "undefined" && "Worker" in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

/**
 * Extracts text from a file (PDF, DOCX, or TXT).
 */
export const extractText = async (file) => {
  const extension = file.name.split('.').pop().toLowerCase();

  switch (extension) {
    case 'pdf':
      return extractPDF(file);
    case 'docx':
      return extractDOCX(file);
    case 'txt':
      return extractTXT(file);
    default:
      throw new Error('Unsupported format. Use PDF, DOCX, or TXT.');
  }
};

const extractPDF = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return cleanText(fullText);
};

const extractDOCX = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return cleanText(result.value);
};

const extractTXT = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(cleanText(e.target.result));
    reader.onerror = () => reject(new Error('Failed to read TXT file.'));
    reader.readAsText(file);
  });
};

/**
 * Normalizes text by removing extra spaces and line breaks.
 */
export const cleanText = (text) => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
};

/**
 * Splits text into chunks of 300-400 words with 50-word overlap.
 */
export const createChunks = (text, docId) => {
  const words = text.split(' ');
  const chunks = [];
  const chunkSize = 350;
  const overlap = 50;

  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    const chunkWords = words.slice(i, i + chunkSize);
    if (chunkWords.length < 50 && chunks.length > 0) break;

    chunks.push({
      id: `${docId}-chunk-${chunks.length}`,
      text: chunkWords.join(' '),
      docId: docId
    });

    if (i + chunkSize >= words.length) break;
  }

  return chunks;
};
