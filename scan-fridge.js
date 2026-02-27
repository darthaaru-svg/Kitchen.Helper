export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://darthaaru-svg.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: "Missing imageDataUrl" });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "List visible foods. Return JSON only: {\"items\":[{\"name\":\"...\",\"confidence\":0.0}]}" },
            { type: "input_image", image_url: imageDataUrl }
          ]
        }]
      })
    });

    const data = await r.json();
    let parsed = { items: [] };
    try { parsed = JSON.parse(data.output_text || "{}"); } catch {}
    return res.status(200).json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
