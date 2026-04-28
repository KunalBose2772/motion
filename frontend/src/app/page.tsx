"use client";

import { useState, useCallback, useRef } from "react";
import type { TabId, FrameDetection } from "@/types";
import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import UploadBox from "@/components/UploadBox";
import VideoPlayerWithOverlay from "@/components/VideoPlayerWithOverlay";
import ResultsPanel from "@/components/ResultsPanel";
import LiveCamera from "@/components/LiveCamera";

export default function Dashboard() {
  const [activeTab,  setActiveTab]  = useState<TabId>("upload");
  const [videoFile,  setVideoFile]  = useState<File | null>(null);
  const [videoUrl,   setVideoUrl]   = useState("");
  const [frames,     setFrames]     = useState<FrameDetection[]>([]);
  const [counts,     setCounts]     = useState<Record<string, number>>({});
  const [csvUrl,     setCsvUrl]     = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [analyzed,   setAnalyzed]   = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [error,      setError]      = useState<string | null>(null);

  const blobUrl       = useRef("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = useCallback(() => {
    setProgress(0);
    let p = 0;
    progressTimer.current = setInterval(() => {
      p = p + (95 - p) * 0.045;
      setProgress(p);
    }, 200);
  }, []);

  const finishProgress = useCallback(() => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    setProgress(100);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    const url = URL.createObjectURL(file);
    blobUrl.current = url;
    setVideoFile(file); setVideoUrl(url);
    setFrames([]); setCounts({}); setCsvUrl(null);
    setAnalyzed(false); setError(null); setProgress(0);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoFile) return;
    setLoading(true); setAnalyzed(false); setError(null);
    startProgress();
    try {
      const form = new FormData();
      form.append("video", videoFile);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      finishProgress();
      setFrames(data.frames ?? []);
      setCounts(data.counts ?? {});
      if (data.csv_url) {
        const name = (data.csv_url as string).split("/").pop() ?? "results.csv";
        setCsvUrl(`/api/download/${name}`);
      }
      setAnalyzed(true);
    } catch (err) {
      finishProgress();
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [videoFile, startProgress, finishProgress]);

  const handleReset = useCallback(() => {
    if (blobUrl.current) { URL.revokeObjectURL(blobUrl.current); blobUrl.current = ""; }
    if (progressTimer.current) clearInterval(progressTimer.current);
    setVideoFile(null); setVideoUrl(""); setFrames([]); setCounts({});
    setCsvUrl(null); setAnalyzed(false); setLoading(false); setError(null); setProgress(0);
  }, []);

  return (
    <>
      <Header />

      <main className="container-fluid container-xl py-5 d-flex flex-column gap-5 flex-grow-1">

        {/* ── Page heading ── */}
        <div className="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-4">
          <div>
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="bg-primary rounded-pill" style={{ width: '32px', height: '2px' }} />
              <span className="small fw-bold text-primary text-uppercase" style={{ letterSpacing: '1px' }}>Object Detection</span>
            </div>
            <h2 className="display-6 fw-black text-dark mb-2" style={{ letterSpacing: '-1px' }}>
              Analyze &amp; Track Objects
            </h2>
            <p className="text-secondary mb-0 fs-6">
              Upload a video or use your live camera to detect, track, and count objects in real time using YOLOv8.
            </p>
          </div>

          {/* Stats chips */}
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {[
              { label: "Model", value: "YOLOv8n", colorClass: "text-primary", bgClass: "bg-primary bg-opacity-10", borderClass: "border-primary-subtle" },
              { label: "Tracker", value: "ByteTrack", colorClass: "text-info", bgClass: "bg-info bg-opacity-10", borderClass: "border-info-subtle" },
              { label: "Backend", value: "FastAPI", colorClass: "text-success", bgClass: "bg-success bg-opacity-10", borderClass: "border-success-subtle" },
            ].map(({ label, value, colorClass, bgClass, borderClass }) => (
              <div key={label} className={`text-center px-3 py-2 rounded-3 border shadow-sm ${bgClass} ${borderClass}`}>
                <div className={`fw-bold text-uppercase ${colorClass}`} style={{ fontSize: '10px', letterSpacing: '0.5px' }}>{label}</div>
                <div className="small fw-black text-dark mt-1">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Main card ── */}
        <div className="card border-0 shadow-custom-lg overflow-hidden bg-white">

          {/* Card header with tabs */}
          <div className="card-header bg-white border-bottom px-4 pt-4 pb-3 d-flex align-items-center justify-content-between flex-wrap gap-3">
            <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Upload tab actions */}
            {activeTab === "upload" && videoFile && (
              <div className="d-flex align-items-center gap-2">
                {/* File chip */}
                <div className="d-flex align-items-center gap-2 text-secondary bg-light border px-3 py-2 rounded-3 text-truncate" style={{ maxWidth: '200px', fontSize: '13px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                  </svg>
                  <span className="fw-semibold text-truncate">{videoFile.name}</span>
                </div>

                {/* Analyze button */}
                {!analyzed && !loading && (
                  <button id="analyze-video" onClick={handleAnalyze} className="btn btn-primary d-flex align-items-center gap-2 px-4 rounded-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    Analyze
                  </button>
                )}

                {/* Re-analyze */}
                {analyzed && !loading && (
                  <button id="re-analyze" onClick={handleAnalyze} className="btn btn-outline-primary d-flex align-items-center gap-2 px-4 rounded-3 bg-primary bg-opacity-10 border-primary-subtle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Re-run
                  </button>
                )}

                {/* Loading */}
                {loading && (
                  <div className="d-flex align-items-center gap-2 px-3 py-2 rounded-3 bg-primary bg-opacity-10 text-primary small fw-bold">
                    <svg className="anim-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analyzing…
                  </div>
                )}

                {/* Clear */}
                <button id="clear-upload" onClick={handleReset} className="btn btn-light border text-secondary d-flex align-items-center gap-2 px-3 rounded-3 hover-danger">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Card content */}
          <div className="card-body p-4 p-lg-5">

            {/* ── Upload tab ── */}
            {activeTab === "upload" && (
              <div className="row g-5">

                {/* Left column */}
                <div className="col-12 col-xl-8">
                  
                  {/* Empty state prompt */}
                  {!videoUrl && (
                    <div className="d-flex flex-column gap-5 anim-fade-up">
                      <UploadBox onFileSelect={handleFileSelect} hasFile={false} />
                      
                      {/* How it works */}
                      <div className="row g-4">
                        {[
                          { step: "01", title: "Upload Video", desc: "Drag & drop or browse for an MP4, AVI, or MOV file.", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12", gradient: "bg-punchy-pink" },
                          { step: "02", title: "AI Analysis", desc: "Our YOLOv8 engine automatically detects and tracks objects.", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11", gradient: "bg-punchy-cyan" },
                          { step: "03", title: "Get Results", desc: "View live bounding boxes and download your CSV report.", icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3", gradient: "bg-punchy-orange" },
                        ].map(({ step, title, desc, icon, gradient }) => (
                          <div key={step} className="col-12 col-md-4">
                            <div className="card h-100 border-0 bg-white rounded-4 p-4 shadow-custom-sm transition-all hover-shadow-md">
                              <div className="d-flex align-items-center gap-3 mb-3">
                                <div className={`${gradient} text-white fw-bold rounded-circle d-flex align-items-center justify-content-center shadow-sm`} style={{ width: '36px', height: '36px', fontSize: '12px' }}>
                                  {step}
                                </div>
                                <div className="flex-grow-1 bg-light rounded-pill" style={{ height: '4px' }}></div>
                              </div>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-dark opacity-75">
                                <path d={icon} />
                              </svg>
                              <h6 className="fw-bold text-dark mb-2 fs-6">{title}</h6>
                              <p className="small text-muted mb-0 lh-base">{desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {videoUrl && (
                    <div className="d-flex flex-column gap-4 anim-fade-up">
                      <VideoPlayerWithOverlay src={videoUrl} frames={frames} />

                      {/* Error */}
                      {error && (
                        <div className="alert alert-danger d-flex align-items-start gap-3 rounded-4 mb-0 border-danger-subtle shadow-sm">
                          <svg width="20" height="20" className="mt-1 flex-shrink-0 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <div>
                            <h6 className="fw-bold mb-1">Analysis Failed</h6>
                            <p className="mb-1 small">{error}</p>
                            <small className="text-danger opacity-75">Make sure the Python backend is running on port 8000.</small>
                          </div>
                        </div>
                      )}

                      {/* Success banner */}
                      {analyzed && !loading && !error && (
                        <div className="alert alert-success d-flex align-items-center justify-content-between rounded-4 mb-0 border-success-subtle shadow-sm py-3 px-4">
                          <div className="d-flex align-items-center gap-3">
                            <div className="bg-white text-success rounded-circle d-flex align-items-center justify-content-center shadow-sm" style={{ width: '32px', height: '32px' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                            <span className="fw-bold text-success-emphasis">
                              Detection complete — {Object.values(counts).reduce((a, b) => a + b, 0)} unique objects found
                            </span>
                          </div>
                          <span className="badge bg-success bg-opacity-25 text-success rounded-pill px-3 py-2 fw-bold">
                            {frames.length} frames
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right sidebar */}
                <div className="col-12 col-xl-4">
                  <div className="sticky-top" style={{ top: '100px' }}>
                    <ResultsPanel
                      counts={counts}
                      csvUrl={csvUrl}
                      loading={loading}
                      progress={progress}
                      error={error}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Live camera tab ── */}
            {activeTab === "live" && <LiveCamera />}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-top py-4 mt-auto">
        <div className="container-fluid container-xl d-flex align-items-center justify-content-between">
          <p className="small text-muted mb-0">
            Motion Movers &copy; {new Date().getFullYear()} — Object Detection Module
          </p>
          <p className="small text-muted mb-0">
            Powered by <span className="fw-bold text-dark">YOLOv8</span> + <span className="fw-bold text-dark">FastAPI</span>
          </p>
        </div>
      </footer>
    </>
  );
}
