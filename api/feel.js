// api/feel.js
// Vercel serverless function with CORS + stronger prompt + few-shot examples.
// Requires: OPENAI_API_KEY set in Vercel → Project → Settings → Environment Variables

export default async function handler(req, res) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();
  if (req.method !== 'POST') return res.status(405).set(CORS).json({ error: 'Use POST', hint: "POST JSON { input: 'I feel ...' }" });

  try {
    // NOTE: front-end will send { input: "...user text..." }
    const { input } = req.body || {};
    if (!input || typeof input !== 'string') {
      return res.status(400).set(CORS).json({ error: "Missing 'input' (string) in request body" });
    }

    const system = `
You are Khayrah, a gentle Islamic spiritual guide.
Task: given a short user feeling or text, 1) classify it to a *specific* emotion label,
2) choose Qur'an ayah(s) that fit the feeling with brief English line(s) + Arabic if helpful + reference,
3) choose an authentic hadith with reference (short line),
4) give concise counsel drawing from classical scholars (e.g., al-Ghazālī, Ibn al-Qayyim, Ibn ʿAṭā’ Allāh) with a source/ref if possible,
5) suggest a short dua that fits the feeling,
6) craft a one-paragraph uplifting pep-talk,
7) propose 6–10 *related feelings* as suggestions (single words/short phrases).

• Keep text brief, specific to the input, and not repetitive across different feelings.
• Never give medical/clinical advice; if crisis language appears, gently urge seeking immediate local help.
• Output ONLY JSON with this exact shape:

{
  "mapped": {
    "feeling": string,                       // e.g. "burnout", "anxious anticipation"
    "quran":   { "ar"?: string, "en": string, "ref": string },
    "quran2"?: { "ar"?: string, "en": string, "ref": string },
    "hadith":  { "en": string, "ar"?: string, "ref": string },
    "counsel": { "by": string, "text": string, "ref"?: string },
    "dua":     string
  },
  "peptalk": string,
  "suggestions": [string, ...]               // related feelings for quick buttons
}

Short, accurate refs only (e.g., "Q 94:5–6", "Bukhari 6114").
    `.trim();

    // Few-shot examples so it doesn't answer the same way for everything:
    const examples = [
      { role: "user", content: "Emotion/Text: I feel overwhelmed by deadlines and family duties." },
      { role: "assistant", content: JSON.stringify({
        mapped:{
          feeling:"overwhelmed",
          quran:{ en:"Seek help through patience and prayer.", ar:"وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", ref:"Q 2:45" },
          quran2:{ en:"Allah does not burden a soul beyond its capacity.", ar:"لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا", ref:"Q 2:286" },
          hadith:{ en:"The strong one controls himself when angry.", ref:"Muslim 2609" },
          counsel:{ by:"al-Ghazālī (adapted)", text:"Break tasks into small trusts: ablution, two rakʿāt, dhikr; then handle the next right action.", ref:"Iḥyāʾ ʿUlūm al-Dīn (themes)" },
          dua:"حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ"
        },
        peptalk:"You are not alone under the load—place it with Allah, then take one small step. Rest is allowed; your worth isn’t your output.",
        suggestions:["stressed","burnout","tired","decision fatigue","under pressure","time anxiety","restless","worn out"]
      }) },

      { role: "user", content: "Emotion/Text: I’m guilty about my mistakes and want to return to Allah." },
      { role: "assistant", content: JSON.stringify({
        mapped:{
          feeling:"guilt with tawbah",
          quran:{ en:"O My servants who have transgressed against themselves, do not despair of Allah’s mercy.", ar:"لَا تَقْنَطُوا مِن رَّحْمَةِ ٱللَّهِ", ref:"Q 39:53" },
          hadith:{ en:"All children of Adam err, and the best of those who err are those who repent.", ref:"Tirmidhī 2499" },
          counsel:{ by:"Ibn al-Qayyim (adapted)", text:"Let remorse lead to action: admit, stop, resolve, repair. Sweetness follows sincere tawbah.", ref:"Madarij al-Sālikīn (themes)" },
          dua:"رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ"
        },
        peptalk:"Your regret is a door that Allah Himself opened. Step through it—He loves those who turn back to Him.",
        suggestions:["repentance","shame","remorse","seeking forgiveness","fear of Allah","renewal","hope","self-reproach"]
      }) }
    ];

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...examples,
        { role: "user", content: `Emotion/Text: ${input}` }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      return res.status(r.status).set(CORS).json({ error: "OpenAI error", detail: await r.text() });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "{}";

    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { peptalk: content }; }

    return res.status(200).set(CORS).json(parsed);
  } catch (err) {
    return res.status(500).set(CORS).json({ error: "Server error", detail: String(err) });
  }
}
