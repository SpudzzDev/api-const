export default async function handler(req, res) {
  // ---------------------
  // Habilitar CORS
  // ---------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const { prompt, image, model, stream } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // ---------------------
    // Lista de modelos
    // ---------------------
    const availableModels = [
      { id: "llama-4-maverick-17b-128e-instruct", name: "Meta Llama 4 Maverick", provider: "voidai" },
      { id: "kimi-k2-instruct", name: "Moonshot Kimi K2", provider: "voidai" },
      { id: "claude-3-5-haiku-20241022", name: "Anthropic Claude Haiku 3.5", provider: "voidai" },
      { id: "gpt-5-chat-latest", name: "OpenAI GPT-5", provider: "navy" },
      { id: "openai", name: "OpenAI GPT-5 Nano", provider: "pollinations" },
      { id: "gemini-2.0-flash", name: "Google Gemini 2.5 Pro", provider: "google" },
      { id: "unity", name: "Nitral Poppy NSFW", provider: "pollinations" }
    ];

    const selectedModel = availableModels.find(m => m.id === model) || availableModels[0];

    // ---------------------
    // Construção da mensagem (suporte multimodal)
    // ---------------------
    let messages = [{ role: "user", content: [{ type: "text", text: prompt }] }];

    const multimodalModels = [
      "gpt-5-nano",
      "openai",
      "gpt-5-chat-latest",
      "gemini-2.0-flash",
      "llama-4-maverick-17b-128e-instruct",
      "kimi-k2-instruct",
      "claude-3-5-haiku-20241022"
    ];

    if (image && multimodalModels.includes(selectedModel.id)) {
      const imageUrls = image.split(",").map(url => ({
        type: "image_url",
        image_url: { url: url.trim() }
      }));
      messages[0].content.push(...imageUrls);
    }

    // ---------------------
    // Montar requisição por provider
    // ---------------------
    let targetUrl = "";
    let headers = {};
    let body = {};

    switch (selectedModel.provider) {
      case "pollinations":
        targetUrl = "https://text.pollinations.ai/openai";
        headers = {
          "Content-Type": "application/json",
          "Authorization": "Bearer fGePk6HQb6Lk3cOV"
        };
        body = { model: selectedModel.id, messages, max_tokens: 500, stream: stream === "true" };
        break;

      case "navy":
        targetUrl = "https://api.navy/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": "Bearer sk-navy-WCdwooKXDafbaNmDaCEQe5yWdhbyW1Mb5XHdFaAL7z8"
        };
        body = { model: selectedModel.id, messages, max_tokens: 8000, stream: stream === "true" };
        break;

      case "voidai":
        targetUrl = "https://api.voidai.app/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": "Bearer sk-voidai-73rxf9Sr00zKozASQfqTIZHvpRxd9rRLDv7NqnXw8ssaG4I0yo6ge4LobD9Frh2XYCcoLqPHzQrNY871Mt71V2Hxdbgfqcg86nXE"
        };
        body = { model: selectedModel.id, messages, temperature: 0.7, stream: stream === "true" };
        break;

      case "google":
        targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel.id}:generateContent`;
        headers = {
          "Content-Type": "application/json",
          "X-goog-api-key": "AIzaSyDmYlNft0R5zCl_E7vplqPcAdmSwCq5VXM"
        };
        body = { contents: [{ parts: [{ text: prompt }] }] };
        break;

      default:
        return res.status(400).json({ error: "Provider não suportado" });
    }

    const providerResp = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "follow"
    });

    if (!providerResp.ok) {
      const txt = await providerResp.text();
      return res.status(providerResp.status).json({ error: "Provider error", details: txt });
    }

    // ---------------------
    // STREAM vs NORMAL
    // ---------------------
    if (stream === "true") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      const reader = providerResp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) res.write(decoder.decode(value));
      }

      res.end();
      return;
    }

    const finalResp = await providerResp.json();

    // ---------------------
    // Normalizar resposta no formato OpenAI
    // ---------------------
    let normalized = finalResp;
    if (selectedModel.provider === "google") {
      const text = finalResp?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      normalized = { choices: [{ message: { role: "assistant", content: text } }] };
    }

    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
