// ============================================================
// POST /api/analyze-image – Proxy to Python backend
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  let body: FormData;
  try {
    body = await req.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid multipart form data" }, { status: 400 });
  }

  const file = body.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ detail: "No image file provided" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("image", file, file.name);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BACKEND}/analyze-image`, {
      method: "POST",
      body: upstream,
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
