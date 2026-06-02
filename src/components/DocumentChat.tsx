import { useState, useRef, useEffect } from "react";
import { chatWithDocument, type ChatMessage } from "../api/storage";

interface Props {
  fileKey: string;
  fileName: string;
  onClose: () => void;
}

export default function DocumentChat({ fileKey, fileName, onClose }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const reply = await chatWithDocument(fileKey, trimmed, history);
      setHistory([...nextHistory, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-overlay" onClick={onClose}>
      <aside className="chat-panel" onClick={(e) => e.stopPropagation()}>
        <header className="chat-header">
          <div className="chat-header-info">
            <span className="chat-header-icon">✦</span>
            <div>
              <p className="chat-header-label">AI Document Chat</p>
              <p className="chat-header-file">{fileName}</p>
            </div>
          </div>
          <button className="chat-close-btn" onClick={onClose}>✕</button>
        </header>

        <div className="chat-messages">
          {history.length === 0 && !loading && (
            <div className="chat-empty">
              <p className="chat-empty-title">Ask anything about this document</p>
              <p className="chat-empty-sub">Summarize it, find key details, ask specific questions.</p>
            </div>
          )}

          {history.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              <p>{msg.content}</p>
            </div>
          ))}

          {loading && (
            <div className="chat-bubble assistant chat-loading">
              <span /><span /><span />
            </div>
          )}

          {error && <p className="chat-error">{error}</p>}

          <div ref={bottomRef} />
        </div>

        <footer className="chat-footer">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Ask a question... (Enter to send)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={loading}
          />
          <button className="chat-send-btn" onClick={send} disabled={loading || !input.trim()}>
            ↑
          </button>
        </footer>
      </aside>
    </div>
  );
}
