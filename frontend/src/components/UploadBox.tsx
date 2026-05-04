"use client";

import { useRef, useCallback, useState } from "react";

interface UploadBoxProps {
  onFileSelect: (file: File) => void;
  hasFile: boolean;
}

export default function UploadBox({ onFileSelect, hasFile }: UploadBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("video/") || file?.type.startsWith("image/")) onFileSelect(file);
  }, [onFileSelect]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = "";
  }, [onFileSelect]);

  if (hasFile) return null;

  const dropzoneClass = `rounded-3xl border-2 p-5 text-center transition-all ${
    isDragging ? "border-primary bg-gradient-primary-light shadow-custom-sm" : "border-dashed bg-white shadow-custom-sm text-muted"
  }`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload media"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      className={dropzoneClass}
      style={{ cursor: "pointer", borderColor: isDragging ? "var(--bs-primary)" : "#dee2e6" }}
    >
      <input ref={inputRef} type="file" accept="video/*,image/*" className="d-none" onChange={handleChange} />

      <div className="py-5 d-flex flex-column align-items-center justify-content-center gap-4 relative">
        
        {/* Icon Container */}
        <div className="position-relative">
          <div className={`d-flex align-items-center justify-content-center rounded-4 transition-all ${isDragging ? "bg-punchy-primary text-white shadow-custom-md" : "bg-light text-primary border"}`}
               style={{ width: "80px", height: "80px", transform: isDragging ? "scale(1.1)" : "scale(1)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          {/* Small badge */}
          <div className="position-absolute bg-white rounded-circle d-flex align-items-center justify-content-center shadow-custom-sm border" style={{ width: "30px", height: "30px", bottom: "-5px", right: "-5px" }}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bs-primary)" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div>
          <h4 className="fs-5 fw-bold text-dark mb-1">
            {isDragging ? "Release to upload" : "Drop your video or photo here"}
          </h4>
          <p className="text-secondary mb-0">
            or <span className="text-primary fw-bold text-decoration-underline" style={{ textUnderlineOffset: '4px' }}>browse files</span>
          </p>
        </div>

        {/* Format chips */}
        <div className="d-flex flex-wrap justify-content-center gap-2 mt-2">
          {["JPG", "PNG", "MP4", "MOV", "WebM"].map((f) => (
            <span key={f} className="badge bg-light text-secondary border rounded-pill px-3 py-2 fw-bold" style={{ fontSize: "11px", letterSpacing: "1px" }}>
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
