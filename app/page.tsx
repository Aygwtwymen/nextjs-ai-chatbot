"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
const starters = ["اشرح لي فكرة صعبة ببساطة", "ساعدني أكتب رسالة احترافية", "اقترح خطة لتعلّم مهارة جديدة"];
const STORAGE_KEY = "nabdh-chat-v1";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "send") return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6"/></svg>;
  if (name === "copy") return <svg {...common}><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed.filter((m): m is Message => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40));
      }
    } catch { /* Ignore unavailable or invalid local storage. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* Storage is optional. */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function sendMessage(text = input) {
    const content = text.trim();
    if (!content || loading) return;
    const next: Message[] = [...messages, { role: "user", content }, { role: "assistant", content: "" }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(0, -1).slice(-20) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "تعذّر الاتصال بالمساعد. حاول مجدداً.");
      }
      if (!response.body) throw new Error("المتصفح لم يستقبل بثّ الرد.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      const consume = (frame: string) => {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              answer += token;
              setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: answer } : m));
            }
          } catch { /* Ignore incomplete or non-JSON event data. */ }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        frames.forEach(consume);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!answer) throw new Error("وصل رد فارغ؛ تحقق من إعداد النموذج ومفتاح الخدمة.");
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      const message = reason instanceof Error ? reason.message : "حدث خطأ غير متوقع.";
      setError(message);
      setMessages((current) => current.at(-1)?.content ? current : current.slice(0, -1));
    } finally {
      setLoading(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void sendMessage(); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }
  function newChat() {
    abortRef.current?.abort();
    setMessages([]); setInput(""); setError(""); setLoading(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ }
    inputRef.current?.focus();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="نبض، الصفحة الرئيسية" onClick={(e) => { e.preventDefault(); newChat(); }}>
          <span className="brand-mark"><Icon name="spark" size={19} /></span><span>نَبض</span>
        </a>
        <div className="topbar-actions">
          <span className="status"><i /> مساعد ذكي</span>
          <button className="new-chat" onClick={newChat} title="محادثة جديدة"><Icon name="plus" size={17} /><span>محادثة جديدة</span></button>
        </div>
      </header>

      <section className={`workspace ${messages.length ? "has-messages" : ""}`}>
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-orb"><Icon name="spark" size={26} /></div>
            <p className="eyebrow">مساحة تفكيرك الجديدة</p>
            <h1>مرحباً، أنا <span>نَبض</span></h1>
            <p className="intro">اسأل، اكتشف، أو ابدأ فكرة جديدة.<br />أنا هنا لأساعدك خطوة بخطوة.</p>
            <div className="suggestions" aria-label="اقتراحات للبدء">
              {starters.map((starter) => <button key={starter} onClick={() => void sendMessage(starter)}>{starter}<span>←</span></button>)}
            </div>
          </div>
        ) : (
          <div className="conversation" aria-live="polite">
            {messages.map((message, index) => (
              <article key={`${index}-${message.role}`} className={`message ${message.role}`}>
                {message.role === "assistant" && <div className="assistant-avatar"><Icon name="spark" size={17} /></div>}
                <div className="message-content">
                  {message.role === "assistant" && <span className="message-label">نَبض</span>}
                  <p>{message.content || (loading && index === messages.length - 1 ? <span className="typing"><i /><i /><i /></span> : "")}</p>
                  {message.role === "assistant" && message.content && <button className="copy-button" onClick={() => void navigator.clipboard?.writeText(message.content)} aria-label="نسخ الرد" title="نسخ الرد"><Icon name="copy" size={15} /></button>}
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>
        )}
        {error && <div className="error-banner" role="alert"><Icon name="info" size={18} /><span>{error}</span><button onClick={() => setError("")} aria-label="إغلاق">×</button></div>}
      </section>

      <footer className="composer-wrap">
        <form className="composer" onSubmit={onSubmit}>
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="اكتب سؤالك هنا…" rows={1} maxLength={8000} aria-label="رسالتك إلى نبض" disabled={loading} />
          <div className="composer-bottom">
            <span className="hint">Enter للإرسال · Shift + Enter لسطر جديد</span>
            <button className="send-button" type="submit" disabled={!input.trim() || loading} aria-label="إرسال الرسالة" title="إرسال">
              {loading ? <span className="loader" /> : <Icon name="send" size={18} />}
            </button>
          </div>
        </form>
        <p className="disclaimer">قد يخطئ المساعد أحياناً؛ راجع المعلومات المهمة.</p>
      </footer>
    </main>
  );
}
