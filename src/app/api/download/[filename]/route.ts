// ============================================================
// GET /api/download/[filename] – Proxy CSV download from backend
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BACKEND}/download/${filename}`, {
      signal: req.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backend unreachable";
    return NextResponse.json({ detail: msg }, { status: 502 });
  }

  if (!upstreamRes.ok) {
    return NextResponse.json(
      { detail: `Backend returned ${upstreamRes.status}` },
      { status: upstreamRes.status }
    );
  }

  const contentType = upstreamRes.headers.get("content-type") ?? "text/csv";
  const buffer = await upstreamRes.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
