// api/feel.js — Vercel Node serverless (no Express). Uses setHeader() for CORS.

export default async function handler(req, res) {
  const setCORS = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  try {
    setCORS();

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res
        .status(405)
        .json({ error: 'Use POST', hint: "POST JSON { input: 'I feel ...' }" });
    }

    // Parse body safely (handles both parsed and raw string bodies)
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const input = body?.input;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: "Missing 'input' (string) in request body" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Server misconfigured: OPENAI_API_KEY is missing.',
        fix: 'Add OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables, then Redeploy.'
      });
    }

    const system = `
You are Khayrah, a gentle Islamic spiritual guide.
Given a short user feeling or text, output ONLY JSON:

{
  "mapped": {
    "feeling": string,
    "quran":   { "ar"?: string, "en": string, "ref": string },
    "quran2"?: { "ar"?: string, "en": string, "ref": string },
    "hadith":  { "en": string, "ar"?: string, "ref": string },
    "counsel": { "by": string, "text": string, "ref"?: string },
    "dua":     string
  },
  "peptalk": string,
  "suggestions": [string, ...]
}

Tailor the content to the feeling, keep it concise with short refs (e.g., "Q 94:5–6", "Bukhari 6114"). Encourage immediate local help if crisis language appears.
`.trim();

    const fewShots = [
      { role: "user", content: "Emotion/Text: I feel overwhelmed by deadlines and family duties." },
      { role: "assistant", content: JSON.stringify({
        mapped:{
          feeling:"overwhelmed",
          quran:{ en:"Seek help through patience and prayer.", ar:"وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", ref:"Q 2:45" },
          quran2:{ en:"Allah does not burden a soul beyond its capacity.", ar:"لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا", ref:"Q 2:286" },
          hadith:{ en:"The strong is the one who controls himself when angry.", ref:"Muslim 2609" },
          counsel:{ by:"al-Ghazālī (adapted)", text:"Break tasks into small trusts: ablution, two rakʿāt, dhikr; then handle the next right action.", ref:"Iḥyāʾ (themes)" },
          dua:"حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ"
        },
        peptalk:"Place the load with Allah, then take one small step. Rest is allowed; your worth isn’t your output.",
        suggestions:["stressed","burnout","tired","decision fatigue","under pressure","time anxiety","restless","worn out"]
      }) },
    ];

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...fewShots,
        { role: "user", content: `Emotion/Text: ${input}` }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text().catch(()=>'');
      console.error('OpenAI error:', r.status, detail);
      return res.status(r.status).json({ error: "OpenAI error", detail });
    }

    const data = await r.js

