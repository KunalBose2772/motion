"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { LiveTrack, ConnectionState } from "@/types";
import { drawDetections, clearCanvas } from "@/lib/drawing";

const WS_URL         = process.env.NEXT_PUBLIC_WS_URL ?? "wss://motion-backend-xyfy.onrender.com/ws/live";
const FRAME_INTERVAL = 120;

const CLASS_EMOJI: Record<string, string> = {
  bed: "🛏️", chair: "🪑", table: "🪵", person: "🧑",
  monitor: "🖥️", laptop: "💻", sofa: "🛋️", tv: "📺",
  bottle: "🍶", cup: "☕", book: "📚",
};

export default function LiveCamera() {
  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const wsRef           = useRef<WebSocket | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const captureRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef          = useRef<number>(0);
  const tracksRef       = useRef<LiveTrack[]>([]);

  const [isStreaming, setIsStreaming]   = useState(false);
  const [connState, setConnState]       = useState<ConnectionState>("disconnected");
  const [liveCounts, setLiveCounts]     = useState<Record<string, number>>({});
  const [camError, setCamError]         = useState<string | null>(null);
  const [wsError, setWsError]           = useState(false);
  const [frameCount, setFrameCount]     = useState(0);

  const syncCanvas = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    const r = v.getBoundingClientRect();
    if (c.width !== r.width)   c.width  = r.width;
    if (c.height !== r.height) c.height = r.height;
  }, []);

  const renderLoop = useCallback(() => {
    const c = canvasRef.current, v = videoRef.current;
    if (!c || !v) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    syncCanvas();
    const tracks = tracksRef.current;
    tracks.length
      ? drawDetections(ctx, tracks, c.width, c.height, v.videoWidth || c.width, v.videoHeight || c.height)
      : clearCanvas(ctx, c.width, c.height);
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [syncCanvas]);

  const applyTracks = useCallback((tracks: LiveTrack[]) => {
    tracksRef.current = tracks;
    setFrameCount(n => n + 1);
    const counts: Record<string, number> = {};
    for (const t of tracks) counts[t.class] = (counts[t.class] || 0) + 1;
    setLiveCounts(counts);
  }, []);

  const connectWs = useCallback(() => {
    setConnState("connecting");
    setWsError(false);
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setConnState("error");
      setWsError(true);
      return;
    }
    wsRef.current = ws;
    ws.onopen    = () => setConnState("connected");
    ws.onerror   = () => { setConnState("error"); setWsError(true); };
    ws.onclose   = () => setConnState("disconnected");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (Array.isArray(msg.tracks)) applyTracks(msg.tracks);
      } catch { /* noop */ }
    };
  }, [applyTracks]);

  const startCapture = useCallback(() => {
    captureRef.current = setInterval(() => {
      const v = videoRef.current, ws = wsRef.current;
      if (!v || !ws || ws.readyState !== WebSocket.OPEN) return;
      const tmp = document.createElement("canvas");
      tmp.width = v.videoWidth; tmp.height = v.videoHeight;
      const ctx = tmp.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      ws.send(tmp.toDataURL("image/jpeg", 0.55));
    }, FRAME_INTERVAL);
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    setWsError(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      setCamError(err instanceof Error ? err.message : "Camera access denied");
      return;
    }
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    await new Promise<void>((res) => {
      if (v.readyState >= HTMLMediaElement.HAVE_METADATA) res();
      else v.addEventListener("loadedmetadata", () => res(), { once: true });
    });
    try {
      await v.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCamError(err instanceof Error ? err.message : "Playback failed");
      return;
    }
    setIsStreaming(true);
    setFrameCount(0);
    connectWs();
    startCapture();
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [connectWs, startCapture, renderLoop]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (captureRef.current) clearInterval(captureRef.current);
    cancelAnimationFrame(rafRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setIsStreaming(false);
    setConnState("disconnected");
    tracksRef.current = [];
    setLiveCounts({});
    setCamError(null);
    setFrameCount(0);
    const c = canvasRef.current;
    if (c) { const ctx = c.getContext("2d"); if (ctx) clearCanvas(ctx, c.width, c.height); }
  }, []);

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = Object.entries(liveCounts).sort((a, b) => b[1] - a[1]);
  const total   = entries.reduce((s, [, v]) => s + v, 0);

  const connBadge = () => {
    const MAP: Record<ConnectionState, { bg: string; dot: string; text: string; label: string }> = {
      disconnected: { bg: "bg-light",  dot: "bg-secondary",  text: "text-secondary",  label: "Offline" },
      connecting:   { bg: "bg-warning bg-opacity-10",   dot: "bg-warning",  text: "text-warning",  label: "Connecting…" },
      connected:    { bg: "bg-success bg-opacity-10", dot: "bg-success",text: "text-success",label: "Connected" },
      error:        { bg: "bg-danger bg-opacity-10",     dot: "bg-danger",    text: "text-danger",    label: "WS Error" },
    };
    const s = MAP[connState];
    return (
      <span className={`badge ${s.bg} ${s.text} border d-flex align-items-center gap-2 px-3 py-2 rounded-pill`} style={{ borderColor: 'transparent' }}>
        <span className={`${s.dot} rounded-circle ${connState === "connecting" ? "anim-pulse-dot" : ""}`} style={{ width: '8px', height: '8px' }}></span>
        {s.label}
      </span>
    );
  };

  return (
    <div className="row g-4 anim-fade-up">

      {/* ── Left: camera viewport ── */}
      <div className="col-12 col-xl-8 d-flex flex-column gap-3">

        {/* Control bar */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center gap-3">
            {!isStreaming ? (
              <button id="start-camera" onClick={startCamera} className="btn btn-primary rounded-3 px-4 d-flex align-items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
                Start Camera
              </button>
            ) : (
              <button id="stop-camera" onClick={stopCamera} className="btn btn-danger rounded-3 px-4 d-flex align-items-center gap-2 shadow-sm fw-semibold border-0" style={{ backgroundColor: "#dc3545" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                Stop Camera
              </button>
            )}
          </div>
          {connBadge()}
        </div>

        {/* Camera error */}
        {camError && (
          <div className="alert alert-danger d-flex align-items-start gap-3 rounded-4 mb-0 border-danger-subtle anim-fade-up shadow-sm">
            <svg width="24" height="24" className="mt-1 flex-shrink-0 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <h6 className="fw-bold mb-1">Camera Access Error</h6>
              <p className="mb-0 small">{camError}</p>
            </div>
          </div>
        )}

        {/* WS warning */}
        {wsError && isStreaming && (
          <div className="alert alert-warning d-flex align-items-center gap-3 rounded-4 mb-0 border-warning-subtle anim-fade-up shadow-sm py-2">
            <svg width="20" height="20" className="text-warning flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="small fw-semibold text-warning-emphasis">
              Backend WebSocket unavailable — detections won&apos;t be drawn on camera
            </span>
          </div>
        )}

        {/* Video box */}
        <div className="position-relative w-100 rounded-4 overflow-hidden bg-dark shadow-custom-lg" style={{ minHeight: '360px' }}>
          <video ref={videoRef} className="w-100 d-block" playsInline muted />
          <canvas ref={canvasRef} className="position-absolute top-0 start-0 w-100 h-100 pe-none" />

          {/* Placeholder */}
          {!isStreaming && !camError && (
            <div className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center gap-3">
              <div className="rounded-4 d-flex align-items-center justify-content-center border border-secondary" style={{ width: '80px', height: '80px', background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div className="text-center text-white">
                <h6 className="fw-semibold mb-1 opacity-75">Camera not started</h6>
                <small className="opacity-50">Click Start Camera to begin live detection</small>
              </div>
            </div>
          )}

          {/* Live badge */}
          {isStreaming && (
            <div className="position-absolute top-0 start-0 m-3">
              <div className="badge bg-danger text-white px-3 py-2 rounded-pill d-flex align-items-center gap-2 shadow" style={{ letterSpacing: '1px' }}>
                <span className="bg-white rounded-circle anim-pulse-dot" style={{ width: '8px', height: '8px' }}></span>
                LIVE
              </div>
            </div>
          )}

          {/* Frame counter */}
          {isStreaming && (
            <div className="position-absolute top-0 end-0 m-3 badge bg-dark bg-opacity-75 text-white font-monospace px-3 py-2 rounded-pill border border-secondary border-opacity-50" style={{ backdropFilter: 'blur(4px)' }}>
              {frameCount} frames
            </div>
          )}
        </div>

        {/* Info strip */}
        {isStreaming && (
          <div className="d-flex align-items-center gap-3 flex-wrap small text-muted">
            <span>Sending frames every <strong className="text-dark">{FRAME_INTERVAL}ms</strong> via WebSocket</span>
            <span className="text-light-subtle">|</span>
            <span>Backend: <strong className="text-dark">{WS_URL}</strong></span>
          </div>
        )}
      </div>

      {/* ── Right: sidebar ── */}
      <div className="col-12 col-xl-4">
        <div className="card border-0 shadow-custom-md h-100 overflow-hidden">
          
          {/* Sidebar header */}
          <div className="card-header bg-light border-bottom px-4 py-3 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <div className="bg-primary bg-opacity-10 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bs-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" />
                  <rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" />
                </svg>
              </div>
              <div>
                <h6 className="mb-0 fw-bold text-dark fs-6">Live Detections</h6>
                <small className="text-muted d-block lh-1 mt-1" style={{ fontSize: '11px' }}>Real-time object counts</small>
              </div>
            </div>
            {isStreaming && (
              <span className="badge border border-danger-subtle bg-danger bg-opacity-10 text-danger rounded-pill d-flex align-items-center gap-1">
                <span className="bg-danger rounded-circle anim-pulse-dot" style={{ width: '6px', height: '6px' }}></span>
                Live
              </span>
            )}
          </div>

          {/* Counts */}
          <div className="card-body p-4 d-flex flex-column gap-3" style={{ minHeight: '300px' }}>
            {entries.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center text-center gap-3 h-100 py-5">
                <div className="bg-light text-secondary rounded-4 d-flex align-items-center justify-content-center border" style={{ width: '64px', height: '64px' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div>
                  <h6 className="fw-bold text-secondary mb-1">
                    {isStreaming ? "Waiting for detections…" : "No camera stream"}
                  </h6>
                  <small className="text-muted">
                    {isStreaming ? "Objects will appear here" : "Start the camera to begin"}
                  </small>
                </div>
              </div>
            ) : (
              <>
                {/* Total */}
                <div className="d-flex align-items-center justify-content-between pb-3 border-bottom">
                  <span className="small fw-bold text-muted text-uppercase">Total Objects</span>
                  <span className="fs-4 fw-black text-primary lh-1">{total}</span>
                </div>
                {/* Per-class list */}
                {entries.map(([cls, count]) => (
                  <div key={cls} className="d-flex align-items-center justify-content-between py-2">
                    <div className="d-flex align-items-center gap-3">
                      <span className="fs-4 lh-1">{CLASS_EMOJI[cls] ?? "📦"}</span>
                      <span className="small fw-bold text-dark text-capitalize">{cls}</span>
                    </div>
                    <div className="d-flex align-items-center gap-3">
                      <div className="progress rounded-pill bg-light" style={{ width: '80px', height: '6px' }}>
                        <div className="progress-bar bg-primary rounded-pill transition-all"
                          style={{ width: `${(count / (entries[0][1] || 1)) * 100}%` }} />
                      </div>
                      <span className="small fw-black text-dark text-end" style={{ width: '20px' }}>{count}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
