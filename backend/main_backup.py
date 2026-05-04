"""
Motion Movers â€“ FastAPI Object Detection Backend
=================================================
Endpoints:
  POST /analyze          â€“ Upload video â†’ run YOLOv8 detection â†’ return frames + counts + csv_url
  GET  /download/{file}  â€“ Download the generated CSV
  WS   /ws/live          â€“ WebSocket for live camera frame detection

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

# â”€â”€ App setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app = FastAPI(title="Motion Movers API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# â”€â”€ Directories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€âfrom ultralytics import YOLOWorld

print("Loading YOLO-World (Open Vocabulary) modelâ€¦")
model = YOLOWorld("yolov8s-worldv2.pt")  # v2 is faster and more accurate

# â”€â”€ Packers & Movers Custom Dictionary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# With YOLO-World, we can define EXACTLY what we want to detect.
# We don't need a filter list anymore; the model will only look for these!
TARGET_CLASSES = [
    "Almirah", "Wardrobe", "Cupboard", "Carton Box", "Suitcase", "Trunk",
    "Washing Machine", "Refrigerator", "Microwave", "Television", "AC Unit",
    "Bed", "Sofa", "Dining Table", "Chair", "Desk", "Bookshelf",
    "Potted Plant", "Mirror", "Curtain", "Laptop", "Monitor"
]

model.set_classes(TARGET_CLASSES)
print(f"Model loaded with {len(TARGET_CLASSES)} custom target classes.")


def friendly_label(name: str) -> str:
    # YOLO-World returns exactly the names we gave it
    return nameicycle", "car", "motorcycle", "ladder", "bucket"
}

# Normalise LVIS names â†’ nicer labels
LABEL_MAP: dict[str, str] = {
    "dining_table": "dining table",
    "microwave_oven": "microwave",
    "washing_machine": "washing machine",
    "air_conditioner": "AC unit",
    "potted_plant": "plant",
    "wardrobe": "Almirah/Wardrobe",
    "cupboard": "Cupboard/Cabinet",
}


def friendly_label(name: str) -> str:
    return LABEL_MAP.get(name, name.replace("_", " "))


# â”€â”€ Global Visual Memory (Spatial Locking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class VisualMemory:
    """
    Stores visual signatures of objects to prevent double-counting 
    when the camera returns to a previously seen area (e.g. 360-degree turn).
    """
    def __init__(self, threshold=0.75):
        self.signatures = {}  # { class_name: [ {id, descriptor, center_color} ] }
        self.threshold = threshold

    def get_signature(self, image, box):
        # Crop and get a visual signature using a simplified color-texture hash
        x, y, w, h = [int(v) for v in box]
        crop = image[max(0, y):y+h, max(0, x):x+w]
        if crop.size == 0: return None
        
        # Resize to standard size for comparison
        small = cv2.resize(crop, (64, 64))
        # Color signature (HSV histogram)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [8, 8], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        return hist

    def find_match(self, cls, signature):
        if signature is None or cls not in self.signatures:
            return None
        
        best_match = None
        max_sim = -1
        
        for item in self.signatures[cls]:
            sim = cv2.compareHist(signature, item["signature"], cv2.HISTCMP_CORREL)
            if sim > max_sim:
                max_sim = sim
                best_match = item["id"]
        
        if max_sim > self.threshold:
            return best_match
        return None

    def add_signature(self, cls, obj_id, signature):
        if signature is None: return
        if cls not in self.signatures:
            self.signatures[cls] = []
        self.signatures[cls].append({"id": obj_id, "signature": signature})


# â”€â”€ Global State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

visual_memory = VisualMemory()


def run_detection_on_frame(
    frame_bgr: np.ndarray,
    track_history: dict[int, str],
    use_spatial_locking: bool = True
) -> list[dict[str, Any]]:
    """
    Run YOLOv8 inference + ByteTrack tracking + Visual ReID.
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

            if cls_name not in CLASSES_OF_INTEREST:
                continue

            label = friendly_label(cls_name)
            conf  = float(box.conf[0])
            track_id = int(box.id[0]) if box.id is not None else -1
            
            # xyxy
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            w = x2 - x1
            h = y2 - y1

            # --- SPATIAL LOCKING LOGIC ---
            if use_spatial_locking and track_id != -1:
                sig = visual_memory.get_signature(frame_bgr, [x1, y1, w, h])
                match_id = visual_memory.find_match(label, sig)
                
                if match_id is not None:
                    # Found an old friend! Reuse the ID to prevent re-counting
                    track_id = match_id
                else:
                    # New unique object, remember its face
                    visual_memory.add_signature(label, track_id, sig)

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


# â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    visual_memory.signatures = {}  # Reset spatial memory for new job

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
    # Sanitise â€“ only allow alphanumeric, dash, underscore, dot
    safe_name = "".join(c for c in filename if c.isalnum() or c in "-_.")
    csv_path = OUTPUT_DIR / safe_name

    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        path=str(csv_path),
        media_type="text/csv",
        filename=safe_name,
    )


# â”€â”€ WebSocket: live camera detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    """
    Receive base64 JPEG frames from the browser, run YOLOv8 detection,
    and stream back track data JSON.
    """
    await ws.accept()
    track_history: dict[int, str] = {}
    visual_memory.signatures = {}  # Reset spatial memory for new live session

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


# â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

