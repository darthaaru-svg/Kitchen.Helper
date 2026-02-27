export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = [
    "https://darthaaru-svg.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://darthaaru-svg.github.io");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res.status(400).json({ error: "Missing imageDataUrl" });
    }

    const aiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: 'List visible food items from this fridge image. Return JSON only in this shape: {"items":[{"name":"milk","confidence":0.92}]}'
              },
              {
                type: "input_image",
                image_url: imageDataUrl
              }
            ]
          }
        ]
      })
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return res.status(500).json({ error: `OpenAI error: ${t}` });
    }

    const data = await aiRes.json();
    const raw = data.output_text || '{"items":[]}';

    let parsed = { items: [] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { items: [] };
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((x) => x && typeof x.name === "string")
          .map((x) => ({
            name: x.name.trim(),
            confidence: Number(x.confidence) || 0
          }))
      : [];

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
