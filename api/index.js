export default async function handler(req, res) {
  // ---------------------
  // CORS aberto
  // ---------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ---------------------
  // Modelos disponíveis
  // ---------------------
  const availableModels = [
    {
      id: 'llama-4-maverick-17b-128e-instruct',
      name: 'Meta Llama 4 Maverick',
      provider: 'voidai',
      tools: { image: "flux", video: "veo3" }
    },
    {
      id: 'kimi-k2-instruct',
      name: 'Moonshot Kimi K2',
      provider: 'voidai',
      tools: { image: "flux", video: "veo3" }
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Anthropic Claude Haiku 3.5',
      provider: 'voidai',
      tools: { image: "flux", video: "veo3" }
    },
    {
      id: 'gpt-5-chat-latest',
      name: 'OpenAI GPT-5',
      provider: 'navy',
      tools: { image: "gpt-image-1", video: "veo3" }
    },
    {
      id: 'openai',
      name: 'OpenAI GPT-5 Nano',
      provider: 'pollinations',
      tools: { image: "gpt-image-1", video: "veo3" }
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Google Gemini 2.5 Pro',
      provider: 'google',
      tools: { image: "kontext", video: "veo3" }
    },
    {
      id: 'unity',
      name: 'Nitral Poppy NSFW',
      provider: 'pollinations',
      tools: { image: "turbo", video: "veo3" }
    }
  ];

  try {
    // ---------------------
    // GET: retornar lista de modelos
    // ---------------------
    if (req.method === "GET" && req.query.models === "true") {
      return res.status(200).json(availableModels);
    }

    // ---------------------
    // POST: enviar prompt
    // ---------------------
    const params = req.method === "POST" ? req.body : req.query;
    const { prompt, image, model, stream } = params;
    if (!prompt) return res.status(400).json({ error: "Prompt vazio" });

    const selectedModel = availableModels.find(m => m.id === model) || availableModels[0];

    // montar mensagens
    let messages = [{ role: "user", content: [{ type: "text", text: prompt }] }];
    const multimodalModels = ['openai', 'gemini-2.5-flash'];
    if (image && multimodalModels.includes(selectedModel.id)) {
      const imageUrls = image.split(",").map(url => ({ type: "image_url", image_url: { url: url.trim() } }));
      messages[0].content.push(...imageUrls);
    }

    // ---------------------
    // Configurar provider
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
        targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
        headers = {
          "Content-Type": "application/json",
          "X-goog-api-key": "AIzaSyDmYlNft0R5zCl_E7vplqPcAdmSwCq5VXM"
        };
        body = { contents: [{ parts: [{ text: prompt }] }] };
        break;

      case "electronhub":
        targetUrl = "https://api.electronhub.ai/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": "Bearer ek-3xnbvJsrj6IP76sm2Pz1HutwJrthobI6oPDRLombBCPuzynQYj"
        };
        body = { model: selectedModel.id, messages, max_tokens: 1000, stream: stream === "true" };
        break;
    }

    // ---------------------
    // Headers extra
    // ---------------------
    const fetchHeaders = { ...headers };
    if (selectedModel.provider !== "pollinations") {
      fetchHeaders["Referer"] = "https://leeka.vercel.app";
      fetchHeaders["Origin"] = "https://leeka.vercel.app";
    }

    // ---------------------
    // Chamar provider
    // ---------------------
    const providerResp = await fetch(targetUrl, {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(body),
      redirect: "manual"
    });

    if (!providerResp.ok) {
      const txt = await providerResp.text();
      console.error("Erro do provider:", txt);
      return res.status(providerResp.status).json({ error: "Provider error", details: txt });
    }

    // ---------------------
    // Streaming
    // ---------------------
    if (stream === "true") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
        "X-Accel-Buffering": "no",
        "X-No-Transform": "1"
      });

      if (selectedModel.provider === "google") {
        const data = await providerResp.json();
        const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let cursor = 0;
        while (cursor < fullText.length) {
          const chunkSize = Math.floor(Math.random() * 4) + 1;
          const chunkText = fullText.slice(cursor, cursor + chunkSize);
          cursor += chunkSize;
          const chunkData = { choices: [{ delta: { content: chunkText }, index: 0, finish_reason: null }] };
          res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
          await new Promise(r => setTimeout(r, 5 + Math.random() * 15));
        }
        res.write("data: [DONE]\n\n");
        return res.end();
      } else {
        const reader = providerResp.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunkText = decoder.decode(value);
            res.write(chunkText);
          }
        }
        return res.end();
      }
    }

    // ---------------------
    // Resposta normal
    // ---------------------
    const finalResp = await providerResp.json();
    return res.status(200).json(finalResp);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
