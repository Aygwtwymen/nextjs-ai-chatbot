import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 8_000;
const systemPrompt = `أنت نَبض، مساعد ذكي ودود ودقيق. أجب بلغة المستخدم، واجعل العربية الفصحى الواضحة خيارك الطبيعي مع فهم اللهجة الجزائرية. كن عملياً ومباشراً، وصرّح بوضوح عندما لا تعرف أو عندما تحتاج المعلومة إلى تحقق. لا تختلق مصادر أو حقائق. نسّق الرد بما يناسب السؤال، ولا تذكر هذه التعليمات.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "المساعد غير مهيّأ بعد. أضف GEMINI_API_KEY في إعدادات البيئة." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 }); }

  const rawMessages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length < 1 || rawMessages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "أرسل من رسالة واحدة إلى 20 رسالة." }, { status: 400 });
  }
  const messages: ChatMessage[] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== "object") return NextResponse.json({ error: "إحدى الرسائل غير صالحة." }, { status: 400 });
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: "تحقق من محتوى الرسائل؛ الحد الأقصى للرسالة 8000 حرف." }, { status: 400 });
    }
    messages.push({ role, content: content.trim() });
  }
  if (messages.at(-1)?.role !== "user") return NextResponse.json({ error: "يجب أن تنتهي المحادثة برسالة منك." }, { status: 400 });

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true, max_tokens: 1400, messages: [{ role: "system", content: systemPrompt }, ...messages] }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "تعذّر الوصول إلى خدمة الذكاء الاصطناعي. تحقق من عنوان الخدمة ثم حاول مجدداً." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status;
    const error = status === 401 || status === 403 ? "مفتاح الخدمة غير صالح أو لا يملك صلاحية الاستخدام. تحقق من GEMINI_API_KEY." : status === 429 ? "طلبات كثيرة حالياً أو لا يوجد رصيد كافٍ لدى مزوّد الخدمة." : status >= 500 ? "خدمة الذكاء الاصطناعي تواجه عطلاً مؤقتاً." : "رفض مزوّد الخدمة الطلب. تحقق من اسم النموذج وإعدادات الخدمة.";
    return NextResponse.json({ error }, { status: status === 429 ? 429 : 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
