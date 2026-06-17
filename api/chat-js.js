import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SYSTEM_PROMPT = `تو یه مشاور متخصص استخدام برنامه‌نویس Senior هستی که به شرکت‌های ایرانی کمک میکنی.
هدفت اینه که در ۳ فاز اطلاعات کامل از کارفرما بگیری:

فاز ۱ - نیاز فنی:
- چه Stack فنی نیاز دارن؟ (مثلاً React، Node، Python، Go، ...)
- سطح تجربه مورد نیاز؟ (Senior 5+ سال یا Lead؟)
- چند نفر نیاز دارن؟
- Remote هست یا حضوری؟

فاز ۲ - ساختار تیم:
- الان تیم چند نفره هستن؟
- این Senior چه نقشی داره؟ (Lead، Architect، Member)
- آیا نیاز به مدیریت تیم دارن؟
- چه پروژه‌ای دارن؟ (Product، Outsource، Startup)

فاز ۳ - بودجه:
- رنج حقوق مد نظر؟
- فول‌تایم یا پاره‌وقت؟
- مزایا و بنفیت‌ها چیه؟

قوانین:
- هر بار فقط ۱-۲ سوال بپرس
- فارسی صحبت کن
- دوستانه و حرفه‌ای باش
- وقتی همه اطلاعات رو گرفتی، یه خلاصه JSON بفرست با این فرمت دقیق:
  PROFILE_JSON:{"stack":"...","level":"...","count":1,"teamStructure":"...","budget":"...","priorities":"...","projectDesc":"..."}
- قبل از JSON بنویس: "✅ اطلاعات کامل شد! پروفایل شما:"`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).json({ error: "Missing fields" });

  const sessionKey = `session:${userId}`;

  // Load history from Redis
  let history = [];
  try {
    const stored = await redis.get(sessionKey);
    if (stored) history = JSON.parse(stored);
  } catch {}

  // Add user message
  history.push({ role: "user", parts: [{ text: message }] });

  // Call Gemini API (رایگان - بدون کارت اعتباری)
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: history,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    }),
  });

  const data = await response.json();

  // Extract reply text from Gemini response
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "خطا در پردازش";

  // Add assistant reply to history (فرمت Gemini)
  history.push({ role: "model", parts: [{ text: reply }] });

  // Save updated history to Redis (TTL: 2 hours)
  await redis.set(sessionKey, JSON.stringify(history), { ex: 7200 });

  // Check if profile is complete
  let profileJson = null;
  const match = reply.match(/PROFILE_JSON:(\{.*?\})/s);
  if (match) {
    try { profileJson = JSON.parse(match[1]); } catch {}
  }

  res.status(200).json({
    reply: reply.replace(/PROFILE_JSON:\{.*?\}/s, "").trim(),
    profile: profileJson,
  });
}
