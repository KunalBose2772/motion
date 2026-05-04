// ============================================================
// Motion Movers – Type Definitions
// ============================================================

/** A single detected object in a frame */
export interface Detection {
  id: number;
  class: string;
  box: [number, number, number, number]; // [x, y, width, height]
  confidence?: number;
}

/** A single frame's detection results */
export interface FrameDetection {
  timestamp: number;
  detections: Detection[];
}

/** Full analysis response from POST /analyze */
export interface AnalysisResponse {
  frames: FrameDetection[];
  counts: Record<string, number>;
  csv_url: string;
}

/** Live track data from WebSocket */
export interface LiveTrack {
  id: number;
  class: string;
  box: [number, number, number, number]; // [x, y, w, h]
  confidence?: number;
}

/** WebSocket message for live detection */
export interface LiveDetectionMessage {
  tracks: LiveTrack[];
}

/** Tab identifiers */
export type TabId = "upload" | "live";



/** Connection states for WebSocket */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";
