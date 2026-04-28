// ============================================================
// POST /api/analyze – Proxy to Python backend
// ============================================================
// This route proxies video uploads to the real ML backend.
// Set BACKEND_URL env var to point at your Python server.
//
// Backend expected contract:
//   POST http://<BACKEND_URL>/analyze
//   Body: multipart/form-data { video: File }
//   Response JSON:
//   {
//     frames: [{ timestamp: number, detections: [{ id, class, box, confidence? }] }],
//     counts: { [class: string]: number },
//     csv_url: string   // relative or absolute URL to download the CSV
//   }

import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  console.log("Proxying /api/analyze request to backend:", BACKEND);
  let body: FormData;
  try {
    body = await req.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid multipart form data" }, { status: 400 });
  }

  const file = body.get("video");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ detail: "No video file provided" }, { status: 400 });
  }

  // Forward request to the Python backend
  const upstream = new FormData();
  upstream.append("video", file, file.name);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BACKEND}/analyze`, {
      method: "POST",
      body: upstream,
      // Signal the upstream to abort if the client disconnects
      signal: req.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backend unreachable";
    return NextResponse.json(
      { detail: `Cannot reach backend at ${BACKEND}: ${msg}` },
      { status: 502 }
    );
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => "");
    return NextResponse.json(
      { detail: `Backend error ${upstreamRes.status}: ${text.slice(0, 200)}` },
      { status: upstreamRes.status }
    );
  }

  const data = await upstreamRes.json();
  return NextResponse.json(data);
}
