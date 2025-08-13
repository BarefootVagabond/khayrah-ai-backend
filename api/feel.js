// api/feel.js
// Vercel Serverless Function (Node.js)
// Requires an environment variable: OPENAI_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // Simple "alive" check when opening in the browser
    return res.status(405).json({ error: "Use POST", hint: "POST JSON { input: 'I feel ...' }" });
  }

  try {
    const { input, profile } = (req.body || {});
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "Missing 'input' (string) in request body" });
    }

    // System prompt mirrors your “Despair Not” GPT intent: brief, authentic, referenced
    const system = `
You are a gentle Islamic spiritual guide named Khayrah. Given a user's emotion or short text:
- Classify/understand the feeling
- Provide Qur'an ayah references (do not paste very long quotes; short lines are fine)
- Provide hadith references
- Offer concise counsel drawing from classical scholars (e.g., al-Ghazali, Ibn al-Qayyim)
- Provide a short uplifting pep-talk
- Encourage immediate local help if the text suggests crisis or harm
Return ONLY JSON with keys:
{
  "mapped": {
    "feeling": string,
    "quran":   { "ar"?: string, "en": string, "ref": string },
    "quran2"?: { "ar"?: string, "en": string, "ref": string },
    "hadith":  { "en": string, "ar"?: string, "ref": string },
    "counsel": { "by": string, "text": string, "ref"?: string },
    "dua":     string
  },
  "peptalk": string
}
Keep it concise and authentic. Avoid medical or clinical advice.
    `.trim();

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Emotion/Text: ${input}\nProfile: ${profile || "despair-not"}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: "OpenAI error", detail: t });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { parsed = { peptalk: raw }; }  // fallback: return text if not valid JSON

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err) });
  }
}
