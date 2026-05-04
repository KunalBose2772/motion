"""
Motion Movers - High-Accuracy YOLO-World Backend
================================================
Optimized for Large (L) model and specific object prompts.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import uuid
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from ultralytics import YOLOWorld
from PIL import Image


app = FastAPI(title="Motion Movers High-Accuracy API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR   = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ---- High-Accuracy Model Setup -----------------------------------------------

# Model Selection: Default to Large for local, Small for memory-constrained cloud (Render)
model_name = os.environ.get("YOLO_MODEL")
if not model_name:
    model_name = "yolov8s-worldv2.pt" if os.environ.get("RENDER") else "yolov8l-worldv2.pt"

print(f"🚀 Loading YOLO-World ({model_name}) for maximum accuracy...")
model = YOLOWorld(model_name)
model.fuse() # Optimization: fuses Conv2d + BatchNorm2d layers


# Refined prompts: Mixed specificity to balance zero-shot detection and precision.
TARGET_CLASSES: list[str] = [
    # Furniture
    "bed", "double bed", "king size bed", "sofa", "couch", "armchair", "l-shape sofa",
    "ottoman", "center table", "coffee table", "dining table", "office desk", "study table",
    "chair", "office chair", "wardrobe", "almirah", "cupboard", "dressing table",
    "bookshelf", "shoe rack", "cabinet", "crockery unit", "bed side table", "bean bag", "mattress",
    
    # Appliances
    "air conditioner", "ac indoor unit", "refrigerator", "fridge", "washing machine", 
    "microwave oven", "dishwasher", "television", "tv", "water purifier", "geyser", 
    "air cooler", "ceiling fan", "induction stove", "gas stove", "kitchen chimney",
    "mixer grinder", "water dispenser", "air purifier", "ups battery", "inverter",
    
    # Packing & Storage
    "carton box", "cardboard box", "shipping box", "suitcase", "luggage", "trunk",
    "plastic crate", "backpack", "travel bag",
    
    # Misc & Gym
    "potted plant", "reflective mirror", "wall painting", "picture frame", "bicycle", "treadmill",
    "gas cylinder", "carpet", "rug", "wall clock", "floor lamp", "vacuum cleaner",
    "dumbbell", "computer monitor", "laptop", "printer", "computer tower",
    
    # Competitive Contrast Classes (To reduce false positives)
    "glass window", "glass door", "glass partition", "transparent glass",
    "stairs", "staircase", "steps", "wall", "floor", "ceiling",

    
    # Sink Classes
    "person", "human", "power socket", "wall plug", "ceiling light"
]


model.set_classes(TARGET_CLASSES)
print(f"✅ Detection model ready with {len(TARGET_CLASSES)} optimized prompts.")


# ---- Improved Visual Memory (Re-ID) ------------------------------------------

class VisualMemory:
    """
    Enhanced visual memory with temporal awareness.
    Only marks duplicates if an object re-appears after being gone for a while.
    """
    def __init__(self, similarity_threshold: float = 0.90): # Increased threshold for higher precision
        self.signatures: dict[str, list[dict]] = {}
        self.threshold = similarity_threshold

    def _get_signature(self, image: np.ndarray, box: list[float]):
        x, y, w, h = (int(v) for v in box)
        crop = image[max(0, y):y+h, max(0, x):x+w]
        if crop.size < 200: return None
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        return hist

    def is_duplicate(self, class_name: str, track_id: int, image: np.ndarray, box: list[float], frame_idx: int) -> bool:
        sig = self._get_signature(image, box)
        if sig is None: return False
        
        key = class_name
        if key not in self.signatures: self.signatures[key] = []
        
        best_sim = -1; best_match_idx = -1
        for i, entry in enumerate(self.signatures[key]):
            sim = cv2.compareHist(sig, entry["sig"], cv2.HISTCMP_CORREL)
            if sim > best_sim: best_sim = sim; best_match_idx = i
                
        if best_sim > self.threshold:
            match = self.signatures[key][best_match_idx]
            if match["id"] != track_id:
                # If extremely similar, it's a duplicate regardless of gap
                if best_sim > 0.95: return True
                # Otherwise check temporal gap
                if (frame_idx - match["last_seen"]) > 45: return True
            
            # Update
            updated = cv2.addWeighted(match["sig"], 0.8, sig, 0.2, 0)
            match["sig"] = cv2.normalize(updated, None)
            match["last_seen"] = frame_idx
            return False
        
        if not any(e["id"] == track_id for e in self.signatures[key]):
            self.signatures[key].append({"id": track_id, "sig": sig, "last_seen": frame_idx})
        return False

    def reset(self): self.signatures = {}

visual_memory = VisualMemory()

# ---- Enhanced Detection Logic ------------------------------------------------

_next_synthetic_id: int = 0

def get_clean_label(raw_cls: str) -> str:
    """Maps robust detection terms to clean UI categories."""
    c = raw_cls.lower()
    
    # Furniture
    if "bed" in c and "side" not in c and "mattress" not in c: return "bed"
    if "sofa" in c or "couch" in c or "armchair" in c: return "sofa"
    if "ottoman" in c: return "ottoman"
    if "dining table" in c: return "dining table"
    if "office desk" in c or "study table" in c or "desk" in c: return "desk"
    if "center table" in c or "coffee table" in c: return "center table"
    if "chair" in c or "bean bag" in c: return "chair"
    if "wardrobe" in c or "almirah" in c or "cupboard" in c: return "wardrobe"
    if "bookshelf" in c: return "bookshelf"
    if "crockery unit" in c: return "crockery unit"
    if "cabinet" in c or "shoe rack" in c: return "cabinet"
    if "dressing table" in c: return "dressing table"
    if "mattress" in c: return "mattress"
    
    # Appliances
    if "air conditioner" in c or "ac unit" in c: return "air conditioner"
    if "refrigerator" in c or "fridge" in c: return "refrigerator"
    if "washing machine" in c: return "washing machine"
    if "television" in c or "tv" in c: return "television"
    if "water purifier" in c: return "water purifier"
    if "geyser" in c: return "geyser"
    if "induction" in c: return "induction cooktop"
    if "gas stove" in c: return "gas stove"
    if "microwave" in c: return "microwave"
    if "chimney" in c: return "kitchen chimney"
    if "mixer" in c or "grinder" in c: return "mixer grinder"
    if "air cooler" in c: return "air cooler"
    if "dispenser" in c: return "water dispenser"
    if "purifier" in c and "water" not in c: return "air purifier"
    if "ups" in c or "inverter" in c or "battery" in c: return "ups inverter"
    
    # Electronics
    if "monitor" in c: return "monitor"
    if "laptop" in c: return "laptop"
    if "printer" in c: return "printer"
    if "computer tower" in c or "desktop" in c: return "desktop computer"
    
    # Packing
    if "box" in c or "crate" in c: return "carton box"
    if "suitcase" in c or "luggage" in c: return "suitcase"
    if "backpack" in c or "travel bag" in c: return "travel bag"
    if "trunk" in c: return "trunk"
    
    # Misc
    if "mirror" in c: return "mirror"
    if "painting" in c or "frame" in c: return "framed painting"
    if "plant" in c: return "potted plant"
    if "clock" in c: return "wall clock"
    if "carpet" in c or "rug" in c: return "rolled carpet"
    if "cylinder" in c: return "gas cylinder"
    if "dumbbell" in c: return "dumbbells"
    if "fan" in c: return "ceiling fan"
    if "lamp" in c: return "floor lamp"
    if "vacuum" in c: return "vacuum cleaner"
    
    # Glass & Structural filtration (often misidentified as furniture)
    if any(k in c for k in ["glass", "window", "partition", "stairs", "step", "wall", "floor", "ceiling"]):
        return "sink"
    
    if "person" in c or "human" in c: return "person"

    if "socket" in c or "plug" in c or "switch" in c or "light" in c: return "sink"

    
    return c


def calculate_iou(box1: list[float], box2: list[float]) -> float:
    """Calculate Intersection over Union of two [x, y, w, h] boxes."""
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    ax1, ay1, ax2, ay2 = x1 - w1/2, y1 - h1/2, x1 + w1/2, y1 + h1/2
    bx1, by1, bx2, by2 = x2 - w2/2, y2 - h2/2, x2 + w2/2, y2 + h2/2
    ix1, iy1, ix2, iy2 = max(ax1, bx1), max(ay1, by1), min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    iarea = iw * ih
    if iarea <= 0: return 0.0
    area1, area2 = w1 * h1, w2 * h2
    union = area1 + area2 - iarea
    return iarea / union if union > 0 else 0.0


def merge_detections(detections: list[dict], iou_thresh: float = 0.55) -> list[dict]:
    """Class-aware NMS to merge duplicate boxes from multi-scale inference."""
    merged: list[dict] = []
    # Sort by confidence descending
    sorted_dets = sorted(detections, key=lambda d: d.get("confidence", 0), reverse=True)
    for det in sorted_dets:
        is_dup = False
        for kept in merged:
            if det["class"] == kept["class"] and calculate_iou(det["box"], kept["box"]) >= iou_thresh:
                is_dup = True; break
        if not is_dup: merged.append(det)
    return merged


def run_detection_on_frame(bgr: np.ndarray, track_history: dict[int, str], frame_idx: int, imgsz: int = 640, augment: bool = False, conf: float = 0.25) -> list[dict]:
    global _next_synthetic_id
    
    results = model.track(
        bgr, 
        persist=True, 
        tracker="bytetrack.yaml", 
        verbose=False, 
        conf=conf, 
        iou=0.35,
        imgsz=imgsz,
        augment=augment
    )


    
    detections: list[dict] = []
    if not results or results[0].boxes is None: return detections
    
    for box in results[0].boxes:
        cls_idx = int(box.cls[0])
        raw_label = TARGET_CLASSES[cls_idx] if cls_idx < len(TARGET_CLASSES) else "unknown"
        
        # Clean up labels for the UI while maintaining precision
        label = get_clean_label(raw_label)
        
        conf = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        bx, by, bw, bh = x1, y1, x2 - x1, y2 - y1
        
        if box.id is not None: track_id = int(box.id[0])
        else:
            _next_synthetic_id += 1
            track_id = 10_000_000 + _next_synthetic_id
            
        track_history[track_id] = label
        
        # Filter out sink classes (people, electronics) to avoid cluttering the inventory UI
        if label in ["person", "sink"]:
            continue
            
        duplicate = visual_memory.is_duplicate(label, track_id, bgr, [bx, by, bw, bh], frame_idx)
        
        detections.append({
            "id": track_id, "class": label,
            "box": [round(bx, 1), round(by, 1), round(bw, 1), round(bh, 1)],
            "confidence": round(conf, 4), "duplicate": duplicate,
        })
    return detections

# ---- Standard Routes ---------------------------------------------------------

def is_nested(inner_box, outer_box, threshold=0.85):
    """Check if the inner box is significantly inside the outer box."""
    ix, iy, iw, ih = inner_box; ox, oy, ow, oh = outer_box
    x1 = max(ix, ox); y1 = max(iy, oy); x2 = min(ix + iw, ox + ow); y2 = min(iy + ih, oy + oh)
    if x2 <= x1 or y2 <= y1: return False
    inter_area = (x2 - x1) * (y2 - y1); inner_area = iw * ih
    return (inter_area / inner_area) > threshold

def build_csv(frames_data: list[dict], counts: dict[str, int]) -> str:
    buf = io.StringIO(); writer = csv.writer(buf)
    writer.writerow(["Frame", "Timestamp_s", "Object_ID", "Class", "X", "Y", "Width", "Height", "Confidence"])
    for i, frame in enumerate(frames_data):
        ts = frame["timestamp"]
        for det in frame["detections"]:
            x, y, w, h = det["box"]
            writer.writerow([i + 1, round(ts, 3), det["id"], det["class"], round(x, 1), round(y, 1), round(w, 1), round(h, 1), det.get("confidence", "")])
    writer.writerow([]); writer.writerow(["=== Summary ==="]); writer.writerow(["Class", "Count"])
    for cls, cnt in sorted(counts.items(), key=lambda kv: -kv[1]): writer.writerow([cls, cnt])
    return buf.getvalue()

@app.get("/")
async def health(): return {"status": "ok", "model": "yolo-world-v2-large", "accuracy": "high"}

@app.post("/analyze")
async def analyze_video(video: UploadFile = File(...)):
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a video.")
    suffix = Path(video.filename or "video.mp4").suffix or ".mp4"
    job_id = uuid.uuid4().hex[:12]; tmp_path = UPLOAD_DIR / f"{job_id}{suffix}"
    try: tmp_path.write_bytes(await video.read())
    except Exception as exc: raise HTTPException(status_code=500, detail=f"Failed to save: {exc}")
    cap = cv2.VideoCapture(str(tmp_path))
    if not cap.isOpened(): tmp_path.unlink(); raise HTTPException(status_code=422, detail="Could not open video.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0; total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); sample_every = max(1, int(fps / 3))
    print(f"🎬 Analyzing video: {total_frames} frames, sampling every {sample_every} frames (~3 FPS)")
    frames_data: list[dict] = []; track_history: dict[int, str] = {}; visual_memory.reset()
    frame_idx = 0; sampled_count = 0
    while True:
        ret, bgr = cap.read()
        if not ret: break
        if frame_idx % sample_every == 0:
            ts = frame_idx / fps; 
            
            # High-Precision pass at 1280px with 0.15 confidence for maximum video accuracy
            # We use 1280px as it's the optimal balance between speed and precision for video.
            dets = run_detection_on_frame(bgr, track_history, frame_idx, imgsz=1280, augment=True, conf=0.15)
            
            if dets: 
                frames_data.append({"timestamp": round(ts, 3), "detections": dets})
            
            sampled_count += 1
            if sampled_count % 5 == 0: print(f"⏳ Processed {frame_idx}/{total_frames} frames...")



        frame_idx += 1
    print(f"✅ Processing complete. Found detections in {len(frames_data)} sampled frames.")
    cap.release(); tmp_path.unlink()
    
    # --- ADVANCED COUNTING LOGIC ---
    id_votes: dict[int, dict[str, int]] = {}; id_lifespans: dict[int, int] = {}
    id_first_seen: dict[int, int] = {}; id_last_seen: dict[int, int] = {}
    id_first_box: dict[int, list[float]] = {}; id_last_box: dict[int, list[float]] = {}
    id_max_overlap: dict[tuple[int, int], float] = {}
    
    for f_idx, frame in enumerate(frames_data):
        frame_dets = frame["detections"]
        for i, det_a in enumerate(frame_dets):
            tid_a = det_a["id"]; box_a = det_a["box"]
            for det_b in frame_dets[i+1:]:
                tid_b = det_b["id"]; box_b = det_b["box"]
                x1 = max(box_a[0], box_b[0]); y1 = max(box_a[1], box_b[1]); x2 = min(box_a[0] + box_a[2], box_b[0] + box_b[2]); y2 = min(box_a[1] + box_a[3], box_b[1] + box_b[3])
                if x2 > x1 and y2 > y1:
                    inter = (x2 - x1) * (y2 - y1); union = (box_a[2] * box_a[3]) + (box_b[2] * box_b[3]) - inter
                    iou = inter / (union + 1e-6); pair = tuple(sorted((tid_a, tid_b))); id_max_overlap[pair] = max(id_max_overlap.get(pair, 0), iou)
        for det in frame_dets:
            if det["id"] > 9000000 or det.get("duplicate"): continue
            tid = det["id"]; cls = det["class"]
            id_votes[tid] = id_votes.get(tid, {}); id_votes[tid][cls] = id_votes[tid].get(cls, 0) + 1
            id_lifespans[tid] = id_lifespans.get(tid, 0) + 1
            if tid not in id_first_seen: id_first_seen[tid] = f_idx; id_first_box[tid] = det["box"]
            id_last_seen[tid] = f_idx; id_last_box[tid] = det["box"]
            
    id_stable_class: dict[int, str] = {}
    for tid, votes in id_votes.items():
        if id_lifespans[tid] >= 2: id_stable_class[tid] = max(votes.items(), key=lambda x: x[1])[0]
            
    to_suppress: set[int] = set(); sorted_ids = sorted(id_stable_class.keys())
    for i, tid_a in enumerate(sorted_ids):
        for tid_b in sorted_ids[i+1:]:
            cls_a = id_stable_class[tid_a]; cls_b = id_stable_class[tid_b]
            if cls_a != cls_b: continue
            pair = tuple(sorted((tid_a, tid_b)))
            if id_max_overlap.get(pair, 0) > 0.40: to_suppress.add(tid_a if id_lifespans[tid_a] < id_lifespans[tid_b] else tid_b); continue
            gap = id_first_seen[tid_b] - id_last_seen[tid_a]
            if 0 <= gap <= 15 and is_nested(id_first_box[tid_b], id_last_box[tid_a], threshold=0.60):
                to_suppress.add(tid_b); id_last_seen[tid_a] = id_last_seen[tid_b]; id_last_box[tid_a] = id_last_box[tid_b]
    
    CONTAINERS = ["wardrobe", "almirah", "bed", "desk", "dining table", "refrigerator", "cabinet", "center table"]
    NESTED_CANDIDATES = ["mirror", "wall clock", "monitor", "laptop", "printer", "microwave", "induction cooktop", "mixer grinder", "mattress"]
    for tid_a, cls_a in id_stable_class.items():
        if tid_a in to_suppress or cls_a not in NESTED_CANDIDATES: continue
        for tid_b, cls_b in id_stable_class.items():
            if tid_a == tid_b or tid_b in to_suppress or cls_b not in CONTAINERS: continue
            if is_nested(id_last_box[tid_a], id_last_box[tid_b]): to_suppress.add(tid_a); break
                
    counts: dict[str, int] = {}
    for tid, cls in id_stable_class.items():
        if tid not in to_suppress: counts[cls] = counts.get(cls, 0) + 1
            
    csv_fn = f"{job_id}_results.csv"; (OUTPUT_DIR / csv_fn).write_text(build_csv(frames_data, counts), encoding="utf-8")
    return JSONResponse({"job_id": job_id, "frames": frames_data, "counts": counts, "csv_url": f"/download/{csv_fn}"})

@app.post("/analyze-image")
async def analyze_image(image: UploadFile = File(...)):
    """High-accuracy multi-scale detection for single uploaded images."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image.")
    
    contents = await image.read()
    pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    
    # Multi-scale inference to capture both small and large objects (matching vision-analytics)
    raw_dets = []
    track_history: dict[int, str] = {}
    
    for size in (1280, 1536):
        # Using a lower confidence threshold for images to catch subtle items
        dets = run_detection_on_frame(bgr, track_history, 0, imgsz=size, augment=True, conf=0.15)
        raw_dets.extend(dets)
    
    # Merge overlapping detections of the same class
    final_dets = merge_detections(raw_dets)
    
    counts: dict[str, int] = {}
    for d in final_dets:
        counts[d["class"]] = counts.get(d["class"], 0) + 1
        
    return JSONResponse({
        "detections": final_dets,
        "counts": counts,
        "image_size": pil_img.size
    })



@app.get("/download/{filename}")
async def download_csv(filename: str):
    safe_name = "".join(c for c in filename if c.isalnum() or c in "-_.")
    path = OUTPUT_DIR / safe_name
    return FileResponse(path=str(path), media_type="text/csv", filename=safe_name) if path.exists() else JSONResponse({"error": "not found"}, 404)

@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await ws.accept(); track_history: dict[int, str] = {}; visual_memory.reset()
    frame_idx = 0
    try:
        while True:
            raw = await ws.receive_text()
            if "," in raw: raw = raw.split(",", 1)[1]
            try:
                img = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
                if img is None: continue
                # In live mode, we use the raw detection results for immediate feedback
                tracks = run_detection_on_frame(img, track_history, frame_idx)
                await ws.send_text(json.dumps({"tracks": tracks}))
                frame_idx += 1
            except: continue
    except: pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
