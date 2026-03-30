import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AppSidebar from "../components/AppSidebar";
import PageTransition from "../components/PageTransition";

import { getAuthToken } from "../utils/auth";
function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "Now";

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getSpeakerBadge(name) {
  if (!name) return "Audio";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function extractAssistantText(res) {
  if (typeof res === "string") return res;
  if (typeof res?.data === "string") return res.data;
  if (typeof res?.data?.answer === "string") return res.data.answer;
  if (typeof res?.answer === "string") return res.answer;
  return "No answer returned from assistant API.";
}
const API_BASE = "https://1hf3sfyu6g.execute-api.ap-southeast-2.amazonaws.com/";
function parseTextOrJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.detail?.message || parsed?.message || text;
  } catch {
    return text;
  }
}
function splitThinkAndAnswer(raw = "", sources = []) {
  if (!raw || typeof raw !== "string") {
    return { thinking: "", answer: "" };
  }

  const match = raw.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);

  let thinking = "";
  let answer = "";

  if (!match) {
    answer = raw.trim();
  } else {
    thinking = (match[1] || "").trim();
    answer = (match[2] || "").trim();
  }

  // 🔥 append sources vào thinking
  if (Array.isArray(sources) && sources.length > 0) {
    const sourceText = sources
      .slice(0, 15)
      .map((s, i) => {
        return `${i + 1}. [${s.topic_label || "source"}] ${s.text || ""}`;
      })
      .join("\n");

    thinking = `${thinking}\n\n---\nSources:\n${sourceText}`;

    if (sources.length > 15) {
      thinking += "\n...";
    }
  }

  return { thinking, answer };
}
function normalizeSources(rawSources) {
  if (!Array.isArray(rawSources)) return [];

  return rawSources.map((source, index) => {
    if (typeof source === "string") {
      return {
        id: `source-${index}`,
        label: source,
      };
    }

    return {
      id: source?.id || `source-${index}`,
      label:
        source?.title ||
        source?.name ||
        source?.text ||
        source?.content ||
        source?.source ||
        `Source ${index + 1}`,
    };
  });
}
export default function AssistantPage() {
  const navigate = useNavigate();
  const { recordingId } = useParams();

  const [transcriptItems, setTranscriptItems] = useState([]);
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState({});
  const chatEndRef = useRef(null);
  const loadTranscript = async () => {
    const token = await getAuthToken();

    const res = await fetch(
      `${API_BASE}/api/recordings/${recordingId}/transcript`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true",
        },
      },
    );

    const text = await res.text();

    if (!res.ok) {
      throw new Error(getErrorMessage(text));
    }

    const data = parseTextOrJson(text);
    const items = data?.data?.items || data?.items || [];
    setTranscriptItems(Array.isArray(items) ? items : []);
  };

  const loadAssistantHistory = async () => {
    const token = await getAuthToken();

    const res = await fetch(
      `${API_BASE}/api/recordings/${recordingId}/assistant`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true",
        },
      },
    );

    const text = await res.text();

    if (!res.ok) {
      throw new Error(getErrorMessage(text));
    }

    const data = parseTextOrJson(text);
    const items = data?.data?.items || data?.items || [];

    const mapped = Array.isArray(items)
      ? items.flatMap((item, index) => {
          const { thinking, answer } = splitThinkAndAnswer(
            item.answer || "",
            item.sources || [],
          );
          return [
            {
              id: item.id ? `q-${item.id}` : `q-${index}`,
              role: "user",
              message: item.question || "",
            },
            {
              id: item.id ? `a-${item.id}` : `a-${index}`,
              role: "assistant",
              message: answer || "No answer returned from assistant.",
              thinking,
              sources: normalizeSources(item.sources || item.contexts || []),
            },
          ];
        })
      : [];

    setAssistantHistory(mapped);
  };
  useEffect(() => {
    async function loadPage() {
      if (!recordingId) {
        setError("Missing recordingId.");
        setPageLoading(false);
        return;
      }

      try {
        await Promise.all([loadTranscript(), loadAssistantHistory()]);
      } catch (err) {
        console.error(err);
      } finally {
        setPageLoading(false);
      }
    }

    loadPage();
  }, [recordingId]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantHistory, loading]);
  const firstHumanSpeaker = useMemo(() => {
    const first = transcriptItems.find(
      (msg) =>
        msg.speaker && msg.speaker !== "You" && msg.speaker !== "Assistant",
    );
    return first?.speaker || null;
  }, [transcriptItems]);
  const handleSend = async () => {
    const value = input.trim();
    if (!value || loading || !recordingId) return;

    setLoading(true);
    setError("");

    const tempUserMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      message: value,
    };

    const tempAssistantMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      message: "",
      thinking: "",
      isThinking: true,
    };

    setAssistantHistory((prev) => [
      ...prev,
      tempUserMessage,
      tempAssistantMessage,
    ]);
    setInput("");

    try {
      const token = await getAuthToken();

      const res = await fetch(
        `${API_BASE}/api/recordings/${recordingId}/assistant/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            message: value,
            includeContext: true,
          }),
        },
      );

      const text = await res.text();

      if (!res.ok) {
        throw new Error(getErrorMessage(text));
      }

      const data = parseTextOrJson(text);

      const firstItem = data?.data?.items?.[0] || null;

      const rawAnswer =
        firstItem?.answer || data?.data?.answer || data?.answer || "";
      const sources =
        firstItem?.sources || data?.data?.sources || data?.sources || [];
      const responseSources =
        firstItem?.sources || data?.data?.sources || data?.sources || [];

      const { thinking, answer } = splitThinkAndAnswer(rawAnswer, sources);

      setAssistantHistory((prev) =>
        prev.map((msg) =>
          msg.id === tempAssistantMessage.id
            ? {
                ...msg,
                message: answer || "No answer returned from assistant.",
                thinking,
                isThinking: false,
              }
            : msg,
        ),
      );
    } catch (err) {
      console.error(err);

      setAssistantHistory((prev) =>
        prev.map((msg) =>
          msg.id === tempAssistantMessage.id
            ? {
                ...msg,
                message: err.message || "Failed to get assistant response.",
                thinking: "",
                isThinking: false,
              }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#f6f7fb] md:grid md:grid-cols-[250px_1fr]">
        <AppSidebar />

        <main className="flex h-screen min-h-0 flex-col bg-[#f7f7f2]">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/library")}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <i className="bi bi-arrow-left" />
              </button>

              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  AI Assistant
                </h2>
                <p className="mt-0.5 break-all text-xs text-slate-400">
                  {recordingId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTranscript(true)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-[#5B4CF5]"
              >
                <i className="bi bi-card-text mr-2" />
                View Transcript
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 bg-[#f7f7f2]">
            <div className="mx-auto mb-6 max-w-4xl">
              <div className="mb-3 text-[11px] font-extrabold tracking-[0.15em] text-slate-400">
                SUGGESTIONS
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setInput("Summarize this call")}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100"
                >
                  Summarize this call
                </button>

                <button
                  onClick={() => setInput("Highlight action items")}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100"
                >
                  Highlight action items
                </button>

                <button
                  onClick={() => setInput("List the key decisions")}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm hover:bg-slate-100"
                >
                  List the key decisions
                </button>
              </div>
            </div>
            {pageLoading ? (
              <div className="text-sm text-slate-500">
                Loading conversation...
              </div>
            ) : assistantHistory.length === 0 ? (
              <div className="max-w-[720px] rounded-2xl bg-indigo-50 p-4 text-sm leading-6 text-slate-600">
                Ask anything about the call to get an AI-generated answer.
              </div>
            ) : (
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                {assistantHistory.map((msg, index) => {
                  const isUser = msg.role === "user";

                  return (
                    <div
                      key={msg.id || index}
                      className={isUser ? "ml-auto max-w-[80%]" : "max-w-[80%]"}
                    >
                      {isUser ? (
                        <div className="rounded-[28px] bg-indigo-600 px-6 py-4 text-base leading-7 text-white shadow-sm">
                          {msg.message}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(msg.isThinking || msg.thinking) && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedThinking((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
                            >
                              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                                {msg.isThinking
                                  ? "Thinking"
                                  : "Thinking process"}
                              </div>

                              <div
                                className={`text-sm leading-6 text-slate-500 transition whitespace-pre-line ${
                                  expandedThinking[msg.id]
                                    ? ""
                                    : "max-h-20 overflow-hidden blur-[3px]"
                                }`}
                              >
                                {msg.isThinking
                                  ? "Analyzing transcript, retrieving context, and preparing the response..."
                                  : msg.thinking}
                              </div>

                              {!msg.isThinking && (
                                <div className="mt-2 text-xs font-medium text-slate-400">
                                  {expandedThinking[msg.id]
                                    ? "Hide reasoning"
                                    : "Show reasoning"}
                                </div>
                              )}
                            </button>
                          )}

                          <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-[15px] leading-7 text-slate-700 shadow-sm">
                            {msg.isThinking ? (
                              <div className="space-y-3">
                                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                                <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="prose prose-slate max-w-none prose-p:leading-7 prose-li:leading-7">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.message || ""}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-[#f7f7f2] px-6 py-4">
            <div className="mx-auto flex max-w-4xl gap-3 rounded-[24px] border border-slate-300 bg-white p-3 shadow-sm">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder="Ask anything about the call..."
                className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-5 outline-none transition focus:border-[#5B4CF5] focus:ring-4 focus:ring-indigo-100"
              />

              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5B4CF5] text-white transition hover:brightness-110 disabled:opacity-60"
              >
                <i className="bi bi-send-fill" />
              </button>
            </div>
          </div>

          {showTranscript && (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/40"
              onClick={() => setShowTranscript(false)}
            >
              <div
                className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Transcript
                    </h3>
                    <p className="text-sm text-slate-500">
                      Full transcript of the recording
                    </p>
                  </div>

                  <button
                    onClick={() => setShowTranscript(false)}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {transcriptItems.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No transcript yet.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {transcriptItems.map((msg, index) => {
                        const badge = getSpeakerBadge(msg.speaker);
                        const time = formatTime(msg.startSec);

                        return (
                          <div
                            key={msg.id || index}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-2 flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-xs font-bold text-indigo-600">
                                {badge}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-900">
                                  {msg.speaker}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {time}
                                </div>
                              </div>
                            </div>

                            <p className="leading-7 text-slate-700">
                              {msg.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
