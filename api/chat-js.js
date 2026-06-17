const SYSTEM_PROMPT = `تو یه مشاور متخصص استخدام برنامه‌نویس Senior هستی که به شرکت‌های ایرانی کمک میکنی.
هدفت اینه که در ۳ فاز اطلاعات کامل از کارفرما بگیری:

فاز ۱ - نیاز فنی:
- چه Stack فنی نیاز دارن؟
- سطح تجربه مورد نیاز؟
- چند نفر نیاز دارن؟
- Remote هست یا حضوری؟

فاز ۲ - ساختار تیم:
- تیم چند نفره هستن؟
- نقش این Senior چیه؟
- چه پروژه‌ای دارن؟

فاز ۳ - بودجه:
- رنج حقوق؟
- فول‌تایم یا پاره‌وقت؟
- مزایا چیه؟

قوانین:
- هر بار فقط ۱-۲ سوال بپرس
- فارسی صحبت کن
- دوستانه و حرفه‌ای باش
- وقتی همه اطلاعات رو گرفتی بنویس:
  PROFILE_JSON:{"stack":"...","level":"...","count":1,"teamStructure":"...","budget":"...","priorities":"...","projectDesc":"..."}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    // ساخت history برای Gemini
    const contents = [
      ...history,
      { role: "user", parts: [{ text: message }] }
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(500).json({ error: "Gemini API error", detail: data });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "خطا در پردازش";
    const updatedHistory = [
      ...contents,
      { role: "model", parts: [{ text: reply }] }
    ];

    let profileJson = null;
    const match = reply.match(/PROFILE_JSON:(\{.*?\})/s);
    if (match) {
      try { profileJson = JSON.parse(match[1]); } catch {}
    }

    res.status(200).json({
      reply: reply.replace(/PROFILE_JSON:\{.*?\}/s, "").trim(),
      profile: profileJson,
      history: updatedHistory,
    });

  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).json({ error: err.message });
  }
}
