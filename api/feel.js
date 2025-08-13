// api/feel.js — Vercel Node serverless (no Express)
// Smart, structured replies + Husary recitation audio links + CORS
// Needs env var: OPENAI_API_KEY (Vercel → Project → Settings → Environment Variables)

export default async function handler(req, res) {
  // --- CORS (Vercel runtime: use setHeader, no chaining)
  const setCORS = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  // Parse refs like "Q 94:5–6" → [{s:94,a:5},{s:94,a:6}]
  const parseQuranRef = (ref) => {
    if (!ref) return [];
    const m = ref.match(/Q(?:ur'?an)?\s*([0-9]+)\s*:\s*([0-9]+)(?:\s*[–-]\s*([0-9]+))?/i);
    if (!m) return [];
    const s = parseInt(m[1],10);
    const a1 = parseInt(m[2],10);
    const a2 = m[3] ? parseInt(m[3],10) : a1;
    const out = [];
    for (let a=a1; a<=a2; a++) out.push({ s, a });
    return out;
  };
  const husaryUrl = ({s,a}) => {
    const S = String(s).padStart(3,'0');
    const A = String(a).padStart(3,'0');
    return `https://www.everyayah.com/data/Husary_128kbps/${S}${A}.mp3`;
  };
  const audioFromRef = (ref) => parseQuranRef(ref).map(husaryUrl);

  try {
    setCORS();
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Use POST', hint: "POST JSON { input: 'I feel ...' }" });
    }

    // Safe body parsing
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
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

    // ---- System prompt (clear JSON schema + constraints)
    const system = `
You are Khayrah, a gentle Islamic spiritual guide.
Given a short user feeling or text, return ONLY JSON:

{
  "mapped": {
    "feeling": string,                            // specific label, not generic
    "quran":   { "ar"?: string, "en": string, "ref": string },
    "quran2"?: { "ar"?: string, "en": string, "ref": string },
    "hadith":  { "en": string, "ar"?: string, "ref": string },
    "counsel": { "by": string, "text": string, "ref"?: string },
    "dua":     string
  },
  "peptalk": string,
  "suggestions": [string, ...]                    // related feelings (6–12 items)
}

• Tailor content tightly to the feeling (no one-size-fits-all).
• Keep refs short, e.g., "Q 94:5–6", "Bukhari 6114", "Muslim 2999".
• Avoid clinical advice; if crisis language appears, gently urge immediate local help.
`.trim();

    // Few-shot to encourage varied, precise mapping
    const fewShots = [
      { role: 'user', content: 'Emotion/Text: I feel overwhelmed by deadlines and family duties.' },
      { role: 'assistant', content: JSON.stringify({
        mapped:{
          feeling:"overwhelmed",
          quran:{ en:"Seek help through patience and prayer.", ar:"وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", ref:"Q 2:45" },
          quran2:{ en:"Allah does not burden a soul beyond its capacity.", ar:"لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا", ref:"Q 2:286" },
          hadith:{ en:"The strong is the one who controls himself when angry.", ref:"Muslim 2609" },
          counsel:{ by:"al-Ghazālī (adapted)", text:"Make wuḍū’, pray two rakʿāt, do dhikr; then handle one small next action.", ref:"Iḥyāʾ (themes)" },
          dua:"حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ"
        },
        peptalk:"Place the burden with Allah, then take one small step. You’re not your output; mercy meets effort.",
        suggestions:["stressed","burnout","time anxiety","decision fatigue","worn out","restless","pressure","fatigue"]
      }) },
      { role: 'user', content: 'Emotion/Text: I’m ashamed of my sins and want to return.' },
      { role: 'assistant', content: JSON.stringify({
        mapped:{
          feeling:"guilt with tawbah",
          quran:{ en:"Do not despair of Allah’s mercy.", ar:"لَا تَقْنَطُوا مِن رَّحْمَةِ ٱللَّهِ", ref:"Q 39:53" },
          hadith:{ en:"All children of Adam err, and the best are those who repent.", ref:"Tirmidhī 2499" },
          counsel:{ by:"Ibn al-Qayyim (adapted)", text:"Let remorse steer four steps: admit, stop, resolve, repair—so the heart is polished.", ref:"Madārij (themes)" },
          dua:"رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ"
        },
        peptalk:"Your regret is a mercy tugging you home. Turn now—Allah loves those who repent.",
        suggestions:["repentance","remorse","shame","seeking forgiveness","renewal","soft heart","fear of Allah","hope"]
      }) }
    ];

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...fewShots,
        { role: 'user', content: `Emotion/Text: ${input}` }
      ]
    };

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text().catch(()=> '');
      console.error('OpenAI error:', r.status, detail);
      return res.status(r.status).json({ error: 'OpenAI error', detail });
    }

    const data = await r.json().catch(e => ({ error: 'bad-json', detail: String(e) }));
    const content = data?.choices?.[0]?.message?.content || '{}';

    // Parse assistant content as JSON
    let out;
    try { out = JSON.parse(content); }
    catch (e) {
      console.error('Parse error; raw:', content);
      out = { peptalk: content };
    }

    // Enrich with Husary audio URLs when refs exist
    if (out?.mapped?.quran?.ref) out.mapped.quran.audio = audioFromRef(out.mapped.quran.ref);
    if (out?.mapped?.quran2?.ref) out.mapped.quran2.audio = audioFromRef(out.mapped.quran2.ref);

    return res.status(200).json(out);

  } catch (err) {
    console.error('Handler crash:', err);
    try { setCORS(); } catch {}
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
