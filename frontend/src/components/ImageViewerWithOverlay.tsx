"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { Detection } from "@/types";
import { drawDetections, clearCanvas } from "@/lib/drawing";

interface Props { 
  src: string; 
  detections: Detection[]; 
}

export default function ImageViewerWithOverlay({ src, detections }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sync = useCallback(() => {
    const img = imgRef.current, c = canvasRef.current;
    if (!img || !c) return;
    const r = img.getBoundingClientRect();
    if (c.width !== r.width) c.width = r.width;
    if (c.height !== r.height) c.height = r.height;
    
    const ctx = c.getContext("2d");
    if (!ctx) return;
    
    if (detections.length) {
      drawDetections(ctx, detections, c.width, c.height, img.naturalWidth || c.width, img.naturalHeight || c.height);
    } else {
      clearCanvas(ctx, c.width, c.height);
    }
  }, [detections]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) sync();
    else img.onload = sync;
  }, [sync, src]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(sync);
    ro.observe(img);
    return () => ro.disconnect();
  }, [sync]);

  return (
    <div className="position-relative w-100 rounded-4 overflow-hidden bg-dark shadow-custom-md d-flex align-items-center justify-content-center" style={{ minHeight: '300px', maxHeight: '70vh' }}>
      <img 
        ref={imgRef} 
        src={src} 
        alt="Analyzed media" 
        className="w-100 h-auto d-block" 
        style={{ maxHeight: '70vh', objectFit: 'contain' }} 
      />
      <canvas ref={canvasRef} className="position-absolute top-0 start-0 w-100 h-100 pe-none" />
      
      {detections.length > 0 && (
        <div className="position-absolute top-0 end-0 m-3 d-flex align-items-center gap-2 bg-dark bg-opacity-75 text-white fw-bold px-3 py-2 rounded-pill shadow" style={{ fontSize: '12px', backdropFilter: 'blur(4px)' }}>
          <span className="bg-primary rounded-circle" style={{ width: '8px', height: '8px' }}></span>
          {detections.length} Objects Found
        </div>
      )}
    </div>
  );
}
