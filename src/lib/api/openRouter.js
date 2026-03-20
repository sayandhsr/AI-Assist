/**
 * openRouter.js
 * Standardized OpenRouter API integration with retry logic and RAG support.
 */

/**
 * Calls the OpenRouter API to get a response.
 * @param {string} query - The user's message.
 * @param {import('./VectorStore').Chunk[]} chunks - Retrieved context chunks (empty for General Mode).
 * @param {string} apiKey - OpenRouter API Key.
 * @param {boolean} isRetry - Whether this is a retry attempt.
 */
export const getAIResponse = async (query, chunks = [], apiKey, isRetry = false) => {
  const context = chunks.length > 0 ? chunks.map(c => c.text).join("\n\n") : null;
  
  // Mandatory Logging
  console.log("User Query:", query);
  console.log("Context:", context || "N/A (General Mode)");

  const systemPrompt = chunks.length > 0 
    ? `You are a document-based AI assistant.
Answer ONLY using the provided context.
Do NOT use outside knowledge.
If the answer is not clearly in the context, say:
'I could not find this information in your documents.'

Context:
${context}`
    : "You are a helpful AI assistant.";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aurex-support.ai", // Required by OpenRouter
        "X-Title": "Aurex Support AI"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Mandatory Logging
    console.log("API Response:", data);

    // Strict Response Parsing
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error("Invalid response format from OpenRouter API.");
    }

  } catch (error) {
    console.error("OpenRouter Error:", error);
    
    // Retry once
    if (!isRetry) {
      console.warn("Retrying OpenRouter call...");
      return getAIResponse(query, chunks, apiKey, true);
    }

    // Fallback error message
    throw new Error("I’m having trouble connecting right now. Please try again in a moment.");
  }
};
