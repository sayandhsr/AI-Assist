/**
 * openRouter.js
 * Handles AI chat completions via OpenRouter with strict RAG context.
 */

export const getAIResponse = async (query, contextChunks, apiKey, model = "openrouter/free") => {
  if (!apiKey) throw new Error("OpenRouter API Key is missing.");

  const contextText = contextChunks
    .map((c, i) => `[Source ${i + 1}]: ${c.text}`)
    .join("\n\n");

  const prompt = `You are a helpful AI customer support assistant.

You MUST answer using ONLY the provided context.

RULES:
- Do NOT use outside knowledge
- Do NOT guess
- If the answer is not clearly in the context, respond politely that the information is not available in the uploaded documents.

STYLE:
- Be friendly and professional
- Answer clearly and concisely
- Sound like a real human support agent

Context:
${contextText}

Question:
${query}

Answer:`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "AUREX SUPPORT AI",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2, // Strictness
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI Error:", error);
    throw new Error("AI service temporarily unavailable");
  }
};
