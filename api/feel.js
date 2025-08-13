// api/feel.js — Vercel Node serverless (no Express).
// Fixes CORS (uses setHeader) and enriches responses with Husary audio URLs.
// Needs env var: OPENAI_API_KEY (set in Vercel → Project → Settings → Environment Variables)

export default async function handler(req, res) {
  // ---- CORS (no chaining .set() in Vercel runtime)
  const setCORS = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  // ---- Helpers: parse refs like "Q 94:5–6" or "Q 2:286" → array of {s, a}
  const parseQuranRef = (ref) => {
    if (!ref) return [];
    // Accept Q|Qur'an|Quran prefixes, tolerate spaces, hyphen/en-dash
    const m = ref.match(/Q(?:ur'?an)?\s*([0-9]+)\s*:\s*([0-9]+)(?:\s*[–-]\s*([0-9]+))?/i);
    if (!m) return [];
    const s = parseInt(m[1], 10);
    const a1 = parseInt(m[2], 10);
    const a2 = m[3] ? parseInt(m[3], 10) : a1;
    const out = [];
    for (let a = a1; a <= a2; a++) out.push({ s, a });
    return out;
  };

  // Build EveryAyah URL for Mahmoud Khalil Al-Ḥuṣarī (128kbps): /data/Husary_128kbps/SSSAAA.mp3
  const husaryUrl = ({ s, a }) => {
    const S = String(s).padStart(3, '0');
    const A = String(a).padStart(3, '0');
    return `https://www.everyayah.com/data/Husary_128kbps/${S}${A}.mp3`;
  };

  // Given a ref like "Q 94:5–6" return an array of MP3 URLs (one per ayah)
  const audioFromRef = (ref) => parseQuranRef(ref).map(husaryUrl);

  try {
    setCORS();

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      return res
        .status(405)
        .json({ error: 'Use POST', hint: "POST JSON { input: 'I feel ...' }" });
    }

    // --- Safe body parsing (handles raw string or parsed JSON)
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

    // -------- Prompt (concise, varied, with short refs) --------
    const system = `
You are Khayrah, a gentle Islamic spiritual guide.
Given a short user feeling or text, return ONLY JSON:

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

• Tailor content to the exact feeling.
• Keep refs short, like "Q 94:5–6", "Bukhari 6114", "Muslim 2999".
• If crisis language appears, gently urge immediate local help.
`.trim();

    // One few-shot to encourage varied, specific outputs
    const shots = [
      { role: 'user', content: 'Emotion/Text: I feel overwhelmed by deadlines and family duties.' },
      { role: 'assistant', content: JSON.stringify({
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
      }) }
    ];

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...shots,
        { role: 'user', content: `Emotion/Text: ${input}` }
      ]
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text().catch(()=>'');
      console.error('OpenAI error:', r.status, detail);
      return res.status(r.status).json({ error: 'OpenAI error', detail });
    }

    const data = await r.json().catch(e => ({ error: 'bad-json', detail: String(e) }));
    const content = data?.choices?.[0]?.message?.content || '{}';

    // Try to parse assistant content as JSON
    let out;
    try { out = JSON.parse(content); }
    catch (e) {
      console.error('Parse error; raw:', content);
      out = { peptalk: content };
    }

    // ---- Enrich with Husary audio URLs if refs are present
    if (out?.mapped?.quran?.ref) {
      out.mapped.quran.audio = audioFromRef(out.mapped.quran.ref); // array of mp3 URLs
    }
    if (out?.mapped?.quran2?.ref) {
      out.mapped.quran2.audio = audioFromRef(out.mapped.quran2.ref);
    }

    return res.status(200).json(out);

  } catch (err) {
    console.error('Handler crash:', err);
    try { setCORS(); } catch {}
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
