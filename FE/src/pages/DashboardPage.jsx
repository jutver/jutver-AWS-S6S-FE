import React, { useEffect, useRef, useState } from "react";

import AppSidebar from "../components/AppSidebar";
import { Link, useNavigate } from "react-router-dom";
import { getAuthToken } from "../utils/auth";
import { getCurrentUser } from "aws-amplify/auth";

import PageTransition from "../components/PageTransition";
const API_BASE = "https://ipiizwxzu2.execute-api.ap-southeast-1.amazonaws.com/dev";

export default function DashboardPage() {
  const fileInputRef = useRef(null);
  const [userId, setUserId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [stepText, setStepText] = useState("");
  const [recentItems, setRecentItems] = useState([]);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [processResult, setProcessResult] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [showUploadWarning, setShowUploadWarning] = useState(false);
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        setUserId(user.userId || user.username || "");
      } catch (err) {
        console.error(err);
      }
    };

    loadUser();
    loadRecentItems();
  }, []);
  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError("");
    setStepText("");
    setUploadInfo(null);
    setProcessResult(null);
    setStatusResult(null);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError("");
    setStepText("");
    setUploadInfo(null);
    setProcessResult(null);
    setStatusResult(null);
  };
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  const formatStatus = (value) => {
    const text = String(value || "")
      .trim()
      .toLowerCase();
    if (!text) return "Unknown";
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const getAudioDuration = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No file provided."));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const audio = new Audio(objectUrl);

      audio.addEventListener("loadedmetadata", () => {
        resolve(audio.duration);
        URL.revokeObjectURL(objectUrl);
      });

      audio.addEventListener("error", () => {
        reject(new Error("Error reading the audio file."));
        URL.revokeObjectURL(objectUrl);
      });
    });
  };

  const getAudioFileType = (file) => {
    if (!file) return "unknown";
    return file.type || "unknown";
  };

  const getFileSizeMB = (file) => {
    if (!file) return 0;
    return Number((file.size / (1024 * 1024)).toFixed(2));
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) {
      setError("Vui lòng chọn file trước.");
      return;
    }

    if (!selectedFile.type.startsWith("audio/")) {
      setError("Chỉ được chọn file audio.");
      return;
    }

    if (!userId) {
      setError(
        "Chưa lấy được userId. Vui lòng thử lại sau khi đăng nhập xong.",
      );
      return;
    }

    setLoading(true);
    setError("");
    setUploadInfo(null);
    setProcessResult(null);
    setStatusResult(null);
    setShowUploadWarning(true);
    try {
      const token = await getAuthToken();
      const contentType = selectedFile.type || "application/octet-stream";

      const duration = await getAudioDuration(selectedFile);
      const durationSec = Math.round(duration);
      const fileType = getAudioFileType(selectedFile);
      const fileSizeMB = getFileSizeMB(selectedFile);

      setStepText("Getting upload URL.");

      const uploadUrlRes = await fetch(
        `${API_BASE}/api/recordings/upload-url?user_id=${encodeURIComponent(userId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${token}`,
          },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType,
            fileSize: selectedFile.size,
            durationSec,
          }),
        },
      );

      const uploadUrlText = await uploadUrlRes.text();

      if (!uploadUrlRes.ok) {
        throw new Error(
          `Lấy upload URL thất bại: HTTP ${uploadUrlRes.status} - ${uploadUrlText}`,
        );
      }

      let uploadUrlJson;
      try {
        uploadUrlJson = JSON.parse(uploadUrlText);
      } catch {
        throw new Error("Response upload-url không phải JSON hợp lệ.");
      }

      const uploadData = uploadUrlJson?.data;
      const uploadUrl = uploadData?.uploadUrl;
      const recordingId = uploadData?.recordingId;
      const transcriptId = uploadData?.transcriptId || null;
      const fileUrl = uploadData?.fileUrl;

      if (!uploadUrl || !recordingId || !fileUrl) {
        throw new Error("Thiếu dữ liệu cần thiết từ API upload-url.");
      }

      setUploadInfo(uploadData);

      setStepText("Uploading file.");

      const s3UploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: selectedFile,
      });

      if (!s3UploadRes.ok) {
        const s3ErrorText = await s3UploadRes.text();
        throw new Error(
          `Upload lên  thất bại: HTTP ${s3UploadRes.status} - ${s3ErrorText}`,
        );
      }

      setStepText("Uploading and Queuing internally.");

      // Synthesize the success payload locally since AWS triggers logic automatically via S3 Events
      const dummyProcessData = { data: { status: "queued" } };
      setProcessResult(dummyProcessData);

      const newItem = {
        recordingId,
        transcriptId,
        fileUrl,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileSizeMB,
        duration,
        fileType,
        status: dummyProcessData.data.status,
        createdAt: new Date().toISOString(),
      };

      saveRecordingToLocal(newItem);
      loadRecentItems();

      setStepText(" upload  và process thành công.");
      window.__toast?.("Upload và process thành công", "success");
    } catch (err) {
      console.error(err);
      setError(err.message || "Có lỗi xảy ra");
      setStepText("");
      window.__toast?.(err.message || "Có lỗi xảy ra", "error");
    } finally {
      setShowUploadWarning(false);
      setLoading(false);
    }
  };
  const saveRecordingToLocal = (item) => {
    const existing = JSON.parse(localStorage.getItem("recordings") || "[]");

    const updated = [
      item,
      ...existing.filter((x) => x.recordingId !== item.recordingId),
    ];

    localStorage.setItem("recordings", JSON.stringify(updated));
    window.dispatchEvent(new Event("recordings-updated"));
  };
  const loadRecentItems = () => {
    const data = JSON.parse(localStorage.getItem("recordings") || "[]");
    setRecentItems(data.slice(0, 3));
  };
  useEffect(() => {
    const syncRecent = () => {
      loadRecentItems();
    };

    window.addEventListener("recordings-updated", syncRecent);
    return () => window.removeEventListener("recordings-updated", syncRecent);
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#f7f7f2] md:grid md:grid-cols-[250px_1fr]">
        <AppSidebar />

        <main className="p-4 md:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Upload your audio files and let our engine work its magic to
                extract insights
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="space-y-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-[#5B4CF5]">
                <span className="h-2 w-2 rounded-full bg-[#5B4CF5]" />
                Engine ready
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`rounded-[24px] border border-dashed bg-white px-6 py-8 shadow-sm transition-all duration-200 ${dragActive
                  ? "border-[#5B4CF5] bg-indigo-50/40 shadow-md"
                  : "border-slate-200"
                  }`}
              >
                <div className="mx-auto max-w-3xl text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".wav,.mp3,.m4a,audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-[#5B4CF5]">
                    <i className="bi bi-cloud-arrow-up text-lg" />
                  </div>

                  <h2 className="text-2xl font-semibold text-slate-900">
                    Upload audio file
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Drop audio here or choose a file to start analysis.
                  </p>
                  {selectedFile && (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
                      <div className="mb-2 text-sm font-bold text-slate-800">
                        File đã chọn
                      </div>
                      <div className="space-y-1 text-sm text-slate-600">
                        <div>
                          <span className="font-semibold">Tên file:</span>{" "}
                          {selectedFile.name}
                        </div>
                        <div>
                          <span className="font-semibold">Loại:</span>{" "}
                          {selectedFile.type || "Không xác định"}
                        </div>
                        <div>
                          <span className="font-semibold">Dung lượng:</span>{" "}
                          {formatFileSize(selectedFile.size)}
                        </div>
                      </div>
                    </div>
                  )}

                  {stepText && (
                    <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                      {stepText}
                    </div>
                  )}

                  <div className="mt-7 flex flex-wrap justify-center gap-4">
                    <button
                      onClick={handleBrowseClick}
                      disabled={loading}
                      className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
                    >
                      <i className="bi bi-file-earmark-arrow-up mr-2" />
                      Browse Files
                    </button>

                    <button
                      onClick={handleUploadAndProcess}
                      disabled={loading || !selectedFile}
                      className="rounded-xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-300 disabled:opacity-60"
                    >
                      {loading ? "Đang xử lý..." : "Upload & Process"}
                    </button>

                    {processResult?.data?.status && uploadInfo?.recordingId && (
                      <button
                        onClick={() =>
                          navigate(`/assistant/${uploadInfo.recordingId}`)
                        }
                        className="rounded-xl bg-indigo-100 px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-200"
                      >
                        <i className="bi bi-stars mr-2" />
                        Open Assistant
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-red-600">
                  {error}
                </div>
              )}

              {statusResult && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900">
                    Status Result
                  </h3>
                  <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-900 p-4 text-sm text-white">
                    {typeof statusResult === "string"
                      ? statusResult
                      : JSON.stringify(statusResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">
                  Recent Insights
                </h3>
                <Link
                  to="/library"
                  className="text-sm font-bold text-indigo-600"
                >
                  VIEW LIBRARY →
                </Link>
              </div>

              <div className="space-y-4">
                {recentItems.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-5 text-slate-500">
                    Chưa có insight gần đây.
                  </div>
                ) : (
                  recentItems.map((item) => (
                    <div
                      key={item.recordingId}
                      className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all duration-200 hover:border-slate-300 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-slate-900 md:text-base">
                            {item.fileName}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500 md:text-sm">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${String(item.status).toLowerCase() === "completed"
                              ? "bg-emerald-500"
                              : String(item.status).toLowerCase() === "failed"
                                ? "bg-red-500"
                                : "bg-amber-500"
                              }`}
                          />
                          {formatStatus(item.status)}
                        </span>
                      </div>

                      <div className="mt-2 break-all text-xs text-slate-600 md:text-sm">
                        <span className="font-semibold">Recording ID:</span>{" "}
                        {item.recordingId}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </main>

        {showUploadWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <i className="bi bi-exclamation-triangle-fill text-2xl" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Upload in progress
                  </h3>
                  <p className="mt-2 leading-7 text-slate-600">
                    Please do not refresh the page or switch to another menu
                    while the audio file is being uploaded and processed.
                  </p>
                  <p className="mt-3 text-sm font-medium text-indigo-600">
                    {stepText || "Preparing upload..."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
