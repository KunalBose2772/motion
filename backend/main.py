"""
Motion Movers – FastAPI Object Detection Backend
=================================================
Endpoints:
  POST /analyze          – Upload video → run YOLOv8 detection → return frames + counts + csv_url
  GET  /download/{file}  – Download the generated CSV
  WS   /ws/live          – WebSocket for live camera frame detection

Requirements: pip install -r requirements.txt
Run:          uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from ultralytics import YOLO

# ── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="Motion Movers API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Directories ──────────────────────────────────────────────────────────────

BASE_DIR    = Path(__file__).parent
UPLOAD_DIR  = BASE_DIR / "uploads"
OUTPUT_DIR  = BASE_DIR / "outputs"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ── Model (loaded once at startup) ───────────────────────────────────────────

print("Loading YOLOv8 model…")
model = YOLO("yolov8n.pt")   # nano – fast; swap for yolov8s.pt / yolov8m.pt for better accuracy
print(f"Model loaded. Classes: {list(model.names.values())[:10]}…")

# ── Helpers ──────────────────────────────────────────────────────────────────

COCO_CLASSES_OF_INTEREST = {
    "bed", "chair", "dining table", "couch", "sofa",
    "tv", "laptop", "keyboard", "cell phone", "book",
    "bottle", "cup", "bowl", "refrigerator", "microwave",
    "oven", "sink", "toilet", "potted plant", "vase",
    "person", "dog", "cat", "bicycle", "car", "backpack",
    "handbag", "suitcase", "clock", "scissors",
}

# Normalise COCO names → nicer labels
LABEL_MAP: dict[str, str] = {
    "dining table": "table",
    "tv": "monitor",
}


def friendly_label(coco_name: str) -> str:
    return LABEL_MAP.get(coco_name, coco_name)


def run_detection_on_frame(
    frame_bgr: np.ndarray,
    track_history: dict[int, str],
) -> list[dict[str, Any]]:
    """
    Run YOLOv8 inference + ByteTrack tracking on a single BGR frame.
    Returns a list of detection dicts compatible with the frontend schema.
    """
    results = model.track(
        frame_bgr,
        persist=True,
        conf=0.35,
        iou=0.45,
        tracker="botsort.yaml",
        verbose=False,
    )

    detections: list[dict[str, Any]] = []

    if results and results[0].boxes is not None:
        boxes = results[0].boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]

            # Only report classes that are relevant to inventory
            if cls_name not in COCO_CLASSES_OF_INTEREST:
                continue

            label = friendly_label(cls_name)
            conf  = float(box.conf[0])
            track_id = int(box.id[0]) if box.id is not None else -1

            # xyxy → xywh (top-left origin)
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            w = x2 - x1
            h = y2 - y1

            if track_id != -1:
                track_history[track_id] = label

            detections.append({
                "id":         track_id if track_id != -1 else id(box),
                "class":      label,
                "box":        [round(x1, 1), round(y1, 1), round(w, 1), round(h, 1)],
                "confidence": round(conf, 4),
            })

    return detections


def build_csv(frames_data: list[dict], counts: dict[str, int]) -> str:
    """Build a CSV string from frame-level detections."""
    buf = io.StringIO()
    writer = csv.writer(buf)

    # Header
    writer.writerow(["Frame", "Timestamp_s", "Object_ID", "Class", "X", "Y", "Width", "Height", "Confidence"])

    for i, frame in enumerate(frames_data):
        ts = frame["timestamp"]
        for det in frame["detections"]:
            x, y, w, h = det["box"]
            writer.writerow([
                i + 1,
                round(ts, 3),
                det["id"],
                det["class"],
                round(x, 1), round(y, 1), round(w, 1), round(h, 1),
                det.get("confidence", ""),
            ])

    # Summary
    writer.writerow([])
    writer.writerow(["=== Summary ==="])
    writer.writerow(["Class", "Count"])
    for cls, cnt in sorted(counts.items(), key=lambda kv: -kv[1]):
        writer.writerow([cls, cnt])

    return buf.getvalue()


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok", "model": "yolov8n"}


@app.post("/analyze")
async def analyze_video(video: UploadFile = File(...)):
    """
    Accept a video file, run YOLOv8+ByteTrack frame-by-frame,
    and return detections, counts, and a CSV download URL.
    """
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a video.")

    # Save upload to temp file
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    job_id = uuid.uuid4().hex[:12]
    tmp_path = UPLOAD_DIR / f"{job_id}{suffix}"

    try:
        contents = await video.read()
        tmp_path.write_bytes(contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {exc}") from exc

    cap = cv2.VideoCapture(str(tmp_path))
    if not cap.isOpened():
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Could not open video file.")

    fps          = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Sample every N frames to keep latency reasonable
    # Process ~2 fps worth of frames (adjustable)
    sample_every = max(1, int(fps / 2))

    frames_data: list[dict] = []
    track_history: dict[int, str] = {}

    frame_idx = 0
    while True:
        ret, bgr = cap.read()
        if not ret:
            break

        if frame_idx % sample_every == 0:
            timestamp = frame_idx / fps
            dets = run_detection_on_frame(bgr, track_history)
            if dets:
                frames_data.append({"timestamp": round(timestamp, 3), "detections": dets})

        frame_idx += 1

    cap.release()
    tmp_path.unlink(missing_ok=True)

    # Robust Object Counting: Filter out tracker noise/flicker
    # Count how many times each unique track ID appears
    track_lifespans: dict[str, int] = {}
    for frame in frames_data:
        for det in frame["detections"]:
            # If id is huge (memory address), it means tracker failed to assign an ID.
            # We skip counting untracked frames as unique objects to prevent extreme overcounting.
            if det["id"] > 1000000:
                continue
            key = f"{det['class']}-{det['id']}"
            track_lifespans[key] = track_lifespans.get(key, 0) + 1

    # Only count objects that were tracked consistently for at least 2 sampled frames
    # (Since we sample at ~2 FPS, 2 frames = ~1 second of visibility)
    counts: dict[str, int] = {}
    for key, lifespan in track_lifespans.items():
        if lifespan >= 2:
            cls_name = key.split("-")[0]
            counts[cls_name] = counts.get(cls_name, 0) + 1

    # Fallback: if a class was detected but never tracked long enough, we still want to 
    # acknowledge it exists (max simultaneous count in any single frame as a fallback)
    max_simultaneous: dict[str, int] = {}
    for frame in frames_data:
        frame_counts: dict[str, int] = {}
        for det in frame["detections"]:
            frame_counts[det["class"]] = frame_counts.get(det["class"], 0) + 1
        for cls, count in frame_counts.items():
            max_simultaneous[cls] = max(max_simultaneous.get(cls, 0), count)

    # Merge: ensure we at least report the max simultaneous count seen for any class
    for cls, max_c in max_simultaneous.items():
        if counts.get(cls, 0) < max_c:
            counts[cls] = max_c

    # Write CSV
    csv_filename = f"{job_id}_results.csv"
    csv_path = OUTPUT_DIR / csv_filename
    csv_path.write_text(build_csv(frames_data, counts), encoding="utf-8")

    return JSONResponse({
        "job_id":  job_id,
        "frames":  frames_data,
        "counts":  counts,
        "csv_url": f"/download/{csv_filename}",
    })


@app.get("/download/{filename}")
async def download_csv(filename: str):
    """Serve a previously generated CSV file."""
    # Sanitise – only allow alphanumeric, dash, underscore, dot
    safe_name = "".join(c for c in filename if c.isalnum() or c in "-_.")
    csv_path = OUTPUT_DIR / safe_name

    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        path=str(csv_path),
        media_type="text/csv",
        filename=safe_name,
    )


# ── WebSocket: live camera detection ─────────────────────────────────────────

@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    """
    Receive base64 JPEG frames from the browser, run YOLOv8 detection,
    and stream back track data JSON.
    """
    await ws.accept()
    track_history: dict[int, str] = {}

    try:
        while True:
            raw = await ws.receive_text()

            # Strip data-URL prefix if present
            if "," in raw:
                raw = raw.split(",", 1)[1]

            try:
                img_bytes = base64.b64decode(raw)
                arr       = np.frombuffer(img_bytes, np.uint8)
                frame     = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue
            except Exception:
                continue

            tracks = run_detection_on_frame(frame, track_history)

            await ws.send_text(json.dumps({"tracks": tracks}))

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[WS] Error: {exc}")
        try:
            await ws.close()
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
