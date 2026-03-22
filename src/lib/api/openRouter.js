/**
 * openRouter.js
 * Implementation of callAI for AUREX SUPPORT AI.
 */

/**
 * Calls the OpenRouter API to get a response.
 * @param {string} message - The user's query.
 * @param {string} context - The retrieved document context (optional).
 */
export async function callAI(message, context = "") {
  const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

  // Mandatory Logging
  console.log("API KEY:", API_KEY);
  console.log("User Query:", message);
  if (context) console.log("Retrieved Chunks:", context);
  console.log("Calling OpenRouter...");

  if (!API_KEY) {
    throw new Error("Missing API key");
  }

  const messages = context
    ? [
        {
          role: "system",
          content: "You are AUREX SUPPORT AI. Answer the user's question ONLY using the provided context. If the context says '[NO RELEVANT INFO]', you MUST reply exactly with: 'I could not find information about this in your uploaded document. Could you please clarify your question?' Do NOT use outside knowledge."
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion:\n${message}`
        }
      ]
    : [
        {
          role: "system",
          content: "You are a helpful assistant."
        },
        {
          role: "user",
          content: message
        }
      ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aurex-support.ai", // Required by OpenRouter
        "X-Title": "Aurex Support AI"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: messages,
        temperature: 0.2
      })
    });

    const data = await response.json();

    // Mandatory Logging
    console.log("API RESPONSE:", data);

    if (!response.ok) {
      console.error("API Error Status:", response.status);
      const errorMsg = data.error?.message || `API request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    if (!data?.choices?.length) {
      console.error("Malformed API Response:", data);
      throw new Error("Invalid API response format");
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error("OpenRouter Detail Error:", error);
    // Provide more specific feedback
    const message = error.message && !error.message.includes("fetch") 
      ? `AI Error: ${error.message}` 
      : "I’m having trouble connecting to the AI. Please check your internet or API key.";
    throw new Error(message);
  }
}
