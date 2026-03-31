import React, { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";

import { getAuthToken } from "../utils/auth";
import PageTransition from "../components/PageTransition";
const API_BASE = "https://ipiizwxzu2.execute-api.ap-southeast-1.amazonaws.com/dev";

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";

  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(value);

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "completed") {
    return "bg-sky-100 text-sky-700";
  }

  if (
    normalized === "processing" ||
    normalized === "queued" ||
    normalized === "pending"
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (normalized === "failed") {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-600";
}

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

export default function LibraryPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [renameModal, setRenameModal] = useState({
    open: false,
    recordingId: "",
    value: "",
  });
  const [actionLoading, setActionLoading] = useState({});

  const fetchTextOrJson = async (url, options = {}) => {
    const token = await getAuthToken();

    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
        ...(options.headers || {}),
      },
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(getErrorMessage(text));
    }

    return parseTextOrJson(text);
  };

  const syncLocalRecordings = (serverItems) => {
    const mapped = serverItems.map((item) => ({
      recordingId: item.id,
      title: item.title || item.fileName || "Untitled",
      fileName: item.fileName || item.title || "Untitled",
      status: item.status || "unknown",
      createdAt: item.createdAt,
      duration: item.durationSec || 0,
      summaryShort: item.summaryShort || "",
    }));

    localStorage.setItem("recordings", JSON.stringify(mapped));
    window.dispatchEvent(new Event("recordings-updated"));
  };

  const fetchLibrary = async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = await getCurrentUser();
      const userId = currentUser.userId || currentUser.username || "";

      const data = await fetchTextOrJson(
        `${API_BASE}/api/library?page=1&limit=20`,
        { method: "GET" },
      );

      const serverItems = data?.data?.items || [];

      setItems(
        serverItems.map((item) => ({
          recordingId: item.id,
          title: item.title || item.fileName || "Untitled",
          fileName: item.fileName || item.title || "Untitled",
          status: item.status || "unknown",
          createdAt: item.createdAt,
          duration: item.durationSec || 0,
          summaryShort:
            item.status === "pending" || item.status === "processing"
              ? "Đang xử lý transcript — thường mất 2–5 phút."
              : (item.summaryShort || "No summary available.")
                .replace(/<think>[\s\S]*?<\/think>/gi, "")
                .trim(),
        })),
      );

      syncLocalRecordings(serverItems);
    } catch (err) {
      console.error(err);
      setError(err.message || "Không tải được library.");
      window.__toast?.(err.message || "Không tải được library", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const filteredAndSortedItems = useMemo(() => {
    let next = [...items];

    if (statusFilter !== "all") {
      next = next.filter(
        (item) => String(item.status || "").toLowerCase() === statusFilter,
      );
    }

    next.sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
        );
      }

      if (sortBy === "title") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }

      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });

    return next;
  }, [items, statusFilter, sortBy]);

  const openRenameModal = (item) => {
    setRenameModal({
      open: true,
      recordingId: item.recordingId,
      value: item.title || item.fileName || "",
    });
  };

  const closeRenameModal = () => {
    setRenameModal({
      open: false,
      recordingId: "",
      value: "",
    });
  };

  const handleRenameRecording = async () => {
    const recordingId = renameModal.recordingId;
    const newTitle = renameModal.value.trim();

    if (!recordingId) return;

    if (!newTitle) {
      window.__toast?.("Tên mới không được để trống", "error");
      return;
    }

    setActionLoading((prev) => ({ ...prev, [recordingId]: true }));

    try {
      await fetchTextOrJson(`${API_BASE}/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newTitle,
        }),
      });

      setItems((prev) =>
        prev.map((item) =>
          item.recordingId === recordingId
            ? {
              ...item,
              title: newTitle,
              fileName: newTitle,
            }
            : item,
        ),
      );

      const saved = JSON.parse(localStorage.getItem("recordings") || "[]");
      const updated = saved.map((item) =>
        item.recordingId === recordingId
          ? {
            ...item,
            title: newTitle,
            fileName: newTitle,
          }
          : item,
      );
      localStorage.setItem("recordings", JSON.stringify(updated));
      window.dispatchEvent(new Event("recordings-updated"));

      closeRenameModal();
      window.__toast?.("Đã đổi tên recording", "success");
    } catch (err) {
      console.error(err);
      window.__toast?.(err.message || "Rename thất bại", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [recordingId]: false }));
    }
  };
  const confirmDelete = (onConfirm) => {
    window.__toast?.(
      <div className="flex items-center gap-3">
        <span>Bạn có chắc muốn xóa?</span>
        <button
          onClick={onConfirm}
          className="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
        >
          Xóa
        </button>
      </div>,
      "warning",
      { duration: 5000 },
    );
  };
  const handleDeleteRecording = async (recordingId) => {
    confirmDelete(async () => {
      setActionLoading((prev) => ({ ...prev, [recordingId]: true }));

      try {
        await fetchTextOrJson(`${API_BASE}/api/recordings/${recordingId}`, {
          method: "DELETE",
        });

        setItems((prev) =>
          prev.filter((item) => item.recordingId !== recordingId),
        );

        const saved = JSON.parse(localStorage.getItem("recordings") || "[]");
        const updated = saved.filter(
          (item) => item.recordingId !== recordingId,
        );
        localStorage.setItem("recordings", JSON.stringify(updated));
        window.dispatchEvent(new Event("recordings-updated"));

        window.__toast?.("Đã xóa recording", "success");
      } catch (err) {
        console.error(err);
        window.__toast?.(err.message || "Delete thất bại", "error");
      } finally {
        setActionLoading((prev) => ({ ...prev, [recordingId]: false }));
      }
    });
  };
  return (
    <PageTransition>
      <div className="min-h-screen bg-[#f7f7f2] md:grid md:grid-cols-[250px_1fr]">
        <AppSidebar />

        <main className="min-h-screen px-6 py-7 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
                  Library
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  Your collection of recorded meetings and insights.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "All recordings" },
                  { key: "completed", label: "Completed" },
                  { key: "pending", label: "Pending" },
                  { key: "processing", label: "Processing" },
                ].map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() => setStatusFilter(chip.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${statusFilter === chip.key
                      ? "bg-indigo-100 text-[#5B4CF5]"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                <option value="latest">Latest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
              </select>
            </div>
            {loading ? (
              <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">
                Loading library...
              </div>
            ) : filteredAndSortedItems.length === 0 ? (
              <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">
                No recordings yet.
              </div>
            ) : (
              <div className="space-y-5">
                {filteredAndSortedItems.map((item) => {
                  const busy = !!actionLoading[item.recordingId];

                  return (
                    <div
                      key={item.recordingId}
                      className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                            <i className="bi bi-mic-fill text-xl" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="truncate text-base font-semibold text-slate-900 md:text-lg">
                                {item.title}
                              </h3>

                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${item.status === "completed"
                                    ? "bg-emerald-500"
                                    : item.status === "failed"
                                      ? "bg-red-500"
                                      : "bg-amber-500"
                                    }`}
                                />
                                {item.status?.charAt(0).toUpperCase() +
                                  item.status?.slice(1)}
                              </span>
                            </div>

                            <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                              {item.summaryShort}
                            </p>

                            <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-400">
                              <div className="flex items-center gap-2">
                                <i className="bi bi-calendar3" />
                                <span>{formatDisplayDate(item.createdAt)}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <i className="bi bi-clock" />
                                <span>{formatDuration(item.duration)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(`/assistant/${item.recordingId}`)
                            }
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-indigo-600 hover:bg-indigo-50"
                            title="Open Assistant"
                          >
                            <i className="bi bi-stars" />
                          </button>

                          <button
                            onClick={() => openRenameModal(item)}
                            disabled={busy}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-amber-600 hover:bg-amber-50 disabled:opacity-60"
                            title="Rename"
                          >
                            <i className="bi bi-pencil-square" />
                          </button>

                          <button
                            onClick={() =>
                              handleDeleteRecording(item.recordingId)
                            }
                            disabled={busy}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Delete"
                          >
                            <i className="bi bi-trash3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {renameModal.open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
              onClick={closeRenameModal}
            >
              <div
                className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-bold text-slate-900">
                  Rename recording
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Enter a new title for this recording.
                </p>

                <input
                  type="text"
                  value={renameModal.value}
                  onChange={(e) =>
                    setRenameModal((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleRenameRecording();
                    }
                  }}
                  className="mt-5 h-12 w-full rounded-2xl border border-slate-200 px-4 outline-none"
                  placeholder="Enter new title"
                  autoFocus
                />

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={closeRenameModal}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleRenameRecording}
                    disabled={
                      !!actionLoading[renameModal.recordingId] ||
                      !renameModal.value.trim()
                    }
                    className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
