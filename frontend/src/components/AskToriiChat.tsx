"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ENDPOINT = "/api/asktorii";
const STORAGE_KEY = "siege:rookery";
const TORII_URL = process.env.NEXT_PUBLIC_TORII_URL || "http://localhost:8080";

type Role = "you" | "chronicler" | "raven-lost";
interface Message {
  id: string;
  role: Role;
  text: string;
  ts: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function AskToriiChat() {
  return <Rookery />;
}

function Rookery() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw) as Message[]);
    } catch {
      /* sessionStorage may be blocked — silently skip */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Esc closes when focused inside; Cmd/Ctrl+; toggles globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ";") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async () => {
    const query = input.trim();
    if (!query || sending) return;
    const now = Date.now();
    const userMsg: Message = { id: `${now}-u`, role: "you", text: query, ts: now };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: now,
          method: "tools/call",
          params: {
            name: "query-world",
            arguments: { question: query, torii_url: TORII_URL },
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 240)}` : ""}`);
      }
      const data = (await res.json()) as JsonRpcResponse;
      if (data.error) {
        throw new Error(`${data.error.code}: ${data.error.message}`);
      }
      const answer = extractAnswer(data.result);
      setMessages((m) => [...m, { id: `${Date.now()}-c`, role: "chronicler", text: answer, ts: Date.now() }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-l`,
          role: "raven-lost",
          text: e instanceof Error ? e.message : String(e),
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setMessages([]);
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    },
    [send],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };

  return (
    <>
      {/* ── Launcher ── */}
      <button
        type="button"
        aria-label={open ? "Close Rookery" : "Open Rookery"}
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-3 px-4 h-11 rounded-full border border-[#3d3428] bg-[#14110e]/95 backdrop-blur-sm text-[#c8a44e] shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out hover:border-[#c8a44e]/60 hover:shadow-[0_0_28px_rgba(200,164,78,0.18)] hover:-translate-y-0.5"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 40,
          opacity: open ? 0 : 1,
          transform: open ? "translateY(8px) scale(0.96)" : undefined,
          pointerEvents: open ? "none" : "auto",
        }}
      >
        <RavenGlyph className="w-5 h-5" />
        <span className="font-serif tracking-[0.3em] text-[10px] uppercase">Rookery</span>
      </button>

      {/* ── Panel ── */}
      <div
        className="flex flex-col w-[400px] max-w-[calc(100vw-3rem)] h-[min(640px,80vh)] rounded-md border border-[#3d3428] bg-[#0d0b0a]/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-300 ease-out"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 40,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.98)",
          pointerEvents: open ? "auto" : "none",
          backgroundImage: "radial-gradient(120% 60% at 50% 0%, rgba(200,164,78,0.05), transparent 60%)",
        }}
        role="dialog"
        aria-label="Rookery — dev wire to asktorii"
      >
        {/* Header */}
        <header className="relative flex items-center justify-between px-4 py-3 border-b border-[#3d3428]">
          <div className="flex items-center gap-3 min-w-0">
            <RavenGlyph className="w-5 h-5 text-[#c8a44e] shrink-0" />
            <div className="min-w-0">
              <div className="font-serif tracking-[0.3em] text-xs uppercase text-[#c8a44e]">The Rookery</div>
              <div className="text-[9px] tracking-[0.2em] uppercase text-[#7a7060] truncate">
                asktorii · the chronicler
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-[#7a7060] hover:text-[#c8a44e] transition-colors w-6 h-6 grid place-items-center"
          >
            <span className="text-base leading-none">×</span>
          </button>
          {/* Decorative gold hairline under header */}
          <span className="absolute left-4 right-4 -bottom-px h-px bg-gradient-to-r from-transparent via-[#c8a44e]/40 to-transparent" />
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#3d3428 transparent" }}
        >
          {messages.length === 0 && !sending && <EmptyScroll />}
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
          {sending && <ChroniclerThinking />}
        </div>

        {/* Composer */}
        <div className="border-t border-[#3d3428] p-3">
          <div className="flex items-end gap-2 rounded-md border border-[#3d3428] bg-[#14110e] focus-within:border-[#c8a44e]/60 focus-within:shadow-[0_0_0_1px_rgba(200,164,78,0.2)] transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              placeholder="Send word to the chronicler…"
              disabled={sending}
              className="flex-1 bg-transparent resize-none outline-none px-3 py-2.5 text-sm text-[#d4cfc6] placeholder:text-[#5a5246] placeholder:italic disabled:opacity-50 leading-relaxed"
              style={{ maxHeight: 140 }}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !input.trim()}
              aria-label="Dispatch raven"
              className="m-1.5 h-8 px-3 rounded-sm bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] hover:bg-[#c8a44e]/20 hover:border-[#c8a44e] transition-all disabled:opacity-30 disabled:hover:bg-[#c8a44e]/10 disabled:hover:border-[#c8a44e]/40 grid place-items-center"
            >
              <span className="text-sm font-bold leading-none translate-y-px">❯</span>
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1 text-[9px] tracking-[0.2em] uppercase text-[#5a5246]">
            <span>
              <Kbd>↵</Kbd> send <span className="mx-1.5 opacity-50">·</span> <Kbd>⇧↵</Kbd> newline
            </span>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                try {
                  sessionStorage.removeItem(STORAGE_KEY);
                } catch {
                  /* ignore */
                }
              }}
              className="hover:text-[#c8a44e] transition-colors"
            >
              <Kbd>⌘K</Kbd> clear
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m }: { m: Message }) {
  if (m.role === "you") {
    return (
      <div className="flex flex-col items-end animate-[fadeIn_0.25s_ease-out]">
        <div className="text-[8px] tracking-[0.3em] uppercase text-[#7a7060] mb-1 mr-1">you</div>
        <div className="max-w-[85%] rounded-md rounded-tr-none border border-[#c8a44e]/30 bg-[#1d1813] px-3 py-2 text-sm text-[#d4cfc6] leading-relaxed whitespace-pre-wrap break-words">
          {m.text}
        </div>
      </div>
    );
  }
  if (m.role === "raven-lost") {
    return (
      <div className="flex flex-col items-start animate-[fadeIn_0.25s_ease-out]">
        <div className="text-[8px] tracking-[0.3em] uppercase text-[#a85a4a] mb-1 ml-1">raven lost</div>
        <div className="max-w-[90%] rounded-md rounded-tl-none border border-[#a85a4a]/40 bg-[#1d100e] px-3 py-2 text-xs text-[#e0bbb1] leading-relaxed font-mono whitespace-pre-wrap break-words">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start animate-[fadeIn_0.3s_ease-out]">
      <div className="text-[8px] tracking-[0.3em] uppercase text-[#c8a44e]/70 mb-1 ml-1 flex items-center gap-1.5">
        <span className="text-[6px]">✦</span> chronicler
      </div>
      <div className="max-w-[90%] rounded-md rounded-tl-none border border-[#3d3428] bg-[#14110e] px-3 py-2 text-sm text-[#d4cfc6] leading-relaxed break-words">
        <Markdown>{m.text}</Markdown>
      </div>
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="rookery-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="text-[#c8a44e] font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic text-[#e0d9c9]">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c8a44e] underline decoration-[#c8a44e]/40 hover:decoration-[#c8a44e] underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) {
              return (
                <code className={`${className ?? ""} block text-[12px]`} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="px-1 py-0.5 rounded-[3px] bg-[#1d1813] border border-[#3d3428] text-[#c8a44e] text-[12px] font-mono"
                {...rest}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 p-2.5 rounded-md bg-[#0a0908] border border-[#3d3428] overflow-x-auto text-[#d4cfc6] text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc marker:text-[#7a7060]">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal marker:text-[#7a7060]">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          h1: ({ children }) => (
            <h3 className="mt-2 mb-1 font-serif tracking-[0.2em] text-[11px] uppercase text-[#c8a44e]">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-2 mb-1 font-serif tracking-[0.2em] text-[11px] uppercase text-[#c8a44e]">{children}</h3>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 font-serif tracking-[0.2em] text-[11px] uppercase text-[#c8a44e]/90">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 mb-1 font-serif tracking-[0.15em] text-[11px] uppercase text-[#c8a44e]/80">
              {children}
            </h4>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 pl-3 border-l-2 border-[#3d3428] text-[#b5ac9c] italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-3 border-0 h-px bg-gradient-to-r from-transparent via-[#3d3428] to-transparent" />
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-[12px] border border-[#3d3428] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="text-left px-2 py-1 bg-[#1d1813] border border-[#3d3428] font-serif tracking-[0.15em] text-[10px] uppercase text-[#c8a44e]">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="px-2 py-1 border border-[#3d3428] align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function ChroniclerThinking() {
  return (
    <div className="flex flex-col items-start">
      <div className="text-[8px] tracking-[0.3em] uppercase text-[#c8a44e]/70 mb-1 ml-1 flex items-center gap-1.5">
        <span className="text-[6px]">✦</span> chronicler
      </div>
      <div className="rounded-md rounded-tl-none border border-[#3d3428] bg-[#14110e] px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[#c8a44e]/70">
          <Dot delay="0ms" />
          <Dot delay="160ms" />
          <Dot delay="320ms" />
        </span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1 h-1 rounded-full bg-current animate-[rookeryPulse_1s_ease-in-out_infinite]"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyScroll() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 select-none">
      <RavenGlyph className="w-10 h-10 text-[#3d3428] mb-4" />
      <p className="font-serif tracking-[0.25em] text-[10px] uppercase text-[#7a7060] mb-2">the perch is empty</p>
      <p className="text-[11px] text-[#5a5246] leading-relaxed max-w-[240px]">
        Pose a question and a raven will carry it to the chronicler at the torii.
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block min-w-[1.1rem] px-1 text-center border border-[#3d3428] rounded-[2px] text-[#7a7060]">
      {children}
    </span>
  );
}

function RavenGlyph({ className }: { className?: string }) {
  // Stylized perched raven silhouette.
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 22c0-4 3-7 7-7 2 0 3 .5 4 1l3-2-1-3 4 2 4-2-1 3 3 1-4 2c0 4-3 7-7 7h-5l-3 3 1-3c-3-.5-5-1-5-2z" />
      <circle cx="22" cy="13" r="0.8" fill="#0d0b0a" />
    </svg>
  );
}

function extractAnswer(result: unknown): string {
  // MCP tools/call result: { content: [{ type: "text", text: "..." }, ...], isError? }
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const content = obj.content;
    if (Array.isArray(content)) {
      const parts = content
        .map((c) =>
          c && typeof c === "object" && typeof (c as Record<string, unknown>).text === "string"
            ? ((c as Record<string, unknown>).text as string)
            : "",
        )
        .filter(Boolean);
      if (parts.length) return parts.join("\n\n");
    }
  }
  return JSON.stringify(result, null, 2);
}
