"use client";

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import type { Detection, FrameDetection } from "@/types";
import { drawDetections, clearCanvas } from "@/lib/drawing";

interface Props { src: string; frames: FrameDetection[]; }
export interface VideoPlayerHandle { getVideoElement: () => HTMLVideoElement | null; }

const VideoPlayerWithOverlay = forwardRef<VideoPlayerHandle, Props>(
  function VideoPlayerWithOverlay({ src, frames }, ref) {
    const videoRef  = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef    = useRef<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);

    useImperativeHandle(ref, () => ({ getVideoElement: () => videoRef.current }));

    const sync = useCallback(() => {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c) return;
      const r = v.getBoundingClientRect();
      if (c.width !== r.width)   c.width  = r.width;
      if (c.height !== r.height) c.height = r.height;
    }, []);

    const getDetections = useCallback((t: number): Detection[] => {
      if (!frames.length) return [];
      let best = frames[0], min = Math.abs(t - best.timestamp);
      for (const f of frames) { const d = Math.abs(t - f.timestamp); if (d < min) { min = d; best = f; } }
      return min > 0.25 ? [] : best.detections;
    }, [frames]);

    const loop = useCallback(() => {
      const v = videoRef.current, c = canvasRef.current;
      if (!v || !c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      sync();
      const dets = getDetections(v.currentTime);
      if (dets.length) {
        drawDetections(ctx, dets, c.width, c.height, v.videoWidth || c.width, v.videoHeight || c.height);
      } else {
        clearCanvas(ctx, c.width, c.height);
      }
      rafRef.current = requestAnimationFrame(loop);
    }, [sync, getDetections]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const start = () => { setIsPlaying(true); cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(loop); };
      const stop  = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); };
      v.addEventListener("play",            start);
      v.addEventListener("pause",           stop);
      v.addEventListener("ended",           stop);
      v.addEventListener("loadedmetadata",  sync);
      sync();
      return () => {
        v.removeEventListener("play",           start);
        v.removeEventListener("pause",          stop);
        v.removeEventListener("ended",          stop);
        v.removeEventListener("loadedmetadata", sync);
        cancelAnimationFrame(rafRef.current);
      };
    }, [loop, sync]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const ro = new ResizeObserver(sync);
      ro.observe(v);
      return () => ro.disconnect();
    }, [sync]);

    return (
      <div className="position-relative w-100 rounded-4 overflow-hidden bg-dark shadow-custom-md">
        <video ref={videoRef} src={src} controls playsInline className="w-100 d-block" />
        <canvas ref={canvasRef} className="position-absolute top-0 start-0 w-100 h-100 pe-none" />

        {/* Detection active badge */}
        {isPlaying && frames.length > 0 && (
          <div className="position-absolute top-0 end-0 m-3 d-flex align-items-center gap-2 bg-dark bg-opacity-75 text-white fw-bold px-3 py-2 rounded-pill shadow" style={{ fontSize: '12px', backdropFilter: 'blur(4px)' }}>
            <span className="bg-success rounded-circle anim-pulse-dot" style={{ width: '8px', height: '8px' }}></span>
            Detecting
          </div>
        )}
      </div>
    );
  }
);

export default VideoPlayerWithOverlay;
