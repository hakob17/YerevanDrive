import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

export function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const sendChat = useStore((s) => s.sendChat);
  const pending = useStore((s) => s.chatPending);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  const submit = () => {
    const m = input.trim();
    if (!m || pending) return;
    setInput("");
    void sendChat(m);
  };

  return (
    <div className="panel chat">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Planning co-pilot</h3>
        <span className="pill">Claude</span>
      </div>
      <div className="messages" ref={listRef}>
        {chat.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            {m.content}
          </div>
        ))}
        {pending && <div className="msg assistant">…thinking</div>}
      </div>
      <div className="composer">
        <textarea
          placeholder="Ask about bottlenecks, timing changes, lane edits…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="primary" onClick={submit} disabled={pending}>
          Send
        </button>
      </div>
      <div className="slim" style={{ marginTop: 6 }}>
        Uses your <code>ANTHROPIC_API_KEY</code> via the dev server. Falls back to an error message if missing.
      </div>
    </div>
  );
}
