"use client";

interface ResultsPanelProps {
  counts: Record<string, number>;
  csvUrl: string | null;
  loading: boolean;
  progress: number;
  error: string | null;
}

const CLASS_CFG: Record<string, { emoji: string; color: string; bg: string }> = {
  bed:         { emoji: "🛏️",  color: "#198754", bg: "#d1e7dd" }, // success
  chair:       { emoji: "🪑",  color: "#0d6efd", bg: "#cfe2ff" }, // primary
  table:       { emoji: "🪵",  color: "#fd7e14", bg: "#ffe5d0" }, // orange
  "dining table": { emoji: "🍽️", color: "#fd7e14", bg: "#ffe5d0" },
  couch:       { emoji: "🛋️",  color: "#6f42c1", bg: "#e0cffc" }, // purple
  sofa:        { emoji: "🛋️",  color: "#6f42c1", bg: "#e0cffc" },
  tv:          { emoji: "📺",  color: "#0dcaf0", bg: "#cff4fc" }, // info
  monitor:     { emoji: "🖥️",  color: "#0dcaf0", bg: "#cff4fc" },
  laptop:      { emoji: "💻",  color: "#6c757d", bg: "#e2e3e5" }, // secondary
  person:      { emoji: "🧑",  color: "#dc3545", bg: "#f8d7da" }, // danger
  cabinet:     { emoji: "🗄️",  color: "#fd7e14", bg: "#ffe5d0" },
  bottle:      { emoji: "🍶",  color: "#198754", bg: "#d1e7dd" },
  cup:         { emoji: "☕",  color: "#d63384", bg: "#f1aeb5" }, // pink
  book:        { emoji: "📚",  color: "#6f42c1", bg: "#e0cffc" },
};
const DEFAULT_CFG = { emoji: "📦", color: "#6c757d", bg: "#e2e3e5" };

export default function ResultsPanel({ counts, csvUrl, loading, progress, error }: ResultsPanelProps) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total   = entries.reduce((s, [, v]) => s + v, 0);
  const maxCount = entries[0]?.[1] ?? 1;

  return (
    <div className="card h-100 d-flex flex-column border-0 shadow-custom-md overflow-hidden bg-white">

      {/* ── Panel header ── */}
      <div className="card-header bg-light border-bottom px-4 py-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-primary bg-opacity-10 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bs-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div>
            <h5 className="mb-0 fw-bold text-dark fs-6">Detection Results</h5>
            <small className="text-muted d-block lh-1 mt-1" style={{ fontSize: '12px' }}>Object inventory summary</small>
          </div>
        </div>
        {total > 0 && (
          <div className="text-end">
            <div className="fs-4 fw-black text-primary lh-1">{total}</div>
            <div className="text-muted fw-semibold text-uppercase mt-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>objects</div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="card-body d-flex flex-column px-4 py-4 gap-4 overflow-auto" style={{ minHeight: '300px' }}>

        {/* Loading */}
        {loading && (
          <div className="d-flex flex-column gap-3 anim-fade-up">
            <div className="d-flex align-items-center justify-content-between small">
              <span className="fw-semibold text-secondary">Analyzing video…</span>
              <span className="fw-bold text-primary">{Math.round(progress)}%</span>
            </div>
            <div className="progress rounded-pill bg-light" style={{ height: '8px' }}>
              <div className="progress-bar bg-punchy-primary rounded-pill transition-all" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="d-flex flex-column gap-3 mt-3">
              {[85, 65, 45].map((w, i) => (
                <div key={i} className="d-flex align-items-center gap-3 placeholder-glow">
                  <div className="placeholder rounded-3" style={{ width: '40px', height: '40px' }}></div>
                  <div className="flex-grow-1">
                    <span className="placeholder col-7 rounded-pill mb-2 d-block"></span>
                    <span className="placeholder col-4 rounded-pill d-block bg-secondary"></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="d-flex flex-column align-items-center justify-content-center text-center gap-3 py-5 anim-fade-up h-100">
            <div className="bg-danger bg-opacity-10 text-danger rounded-4 d-flex align-items-center justify-content-center border border-danger-subtle" style={{ width: '64px', height: '64px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h6 className="fw-bold text-dark mb-1">Analysis Failed</h6>
              <p className="small text-danger mb-0 px-3">{error}</p>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && entries.length === 0 && (
          <div className="d-flex flex-column align-items-center justify-content-center text-center gap-3 py-5 anim-fade-up h-100">
            <div className="bg-light text-secondary rounded-4 d-flex align-items-center justify-content-center border" style={{ width: '64px', height: '64px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div>
              <h6 className="fw-bold text-dark mb-1">No Results Yet</h6>
              <p className="small text-muted mb-0">Upload a video and click<br />Analyze to detect objects</p>
            </div>
          </div>
        )}

        {/* Object count bars */}
        {!loading && !error && entries.length > 0 && (
          <div className="d-flex flex-column gap-3 anim-fade-up">
            {entries.map(([cls, count]) => {
              const cfg = CLASS_CFG[cls] ?? DEFAULT_CFG;
              const barPct = (count / maxCount) * 100;
              return (
                <div key={cls} className="d-flex flex-column gap-2">
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fs-5 lh-1">{cfg.emoji}</span>
                      <span className="fw-semibold text-dark text-capitalize small">{cls}</span>
                    </div>
                    <span className="fw-bold" style={{ color: cfg.color }}>{count}</span>
                  </div>
                  <div className="progress rounded-pill bg-light" style={{ height: '6px' }}>
                    <div className="progress-bar rounded-pill transition-all duration-500"
                      style={{ width: `${barPct}%`, backgroundColor: cfg.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ── CSV download footer ── */}
      {!loading && !error && csvUrl && (
        <div className="card-footer bg-light border-top px-4 py-3">
          <a
            id="download-csv"
            href={csvUrl}
            download
            className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 py-2 rounded-3"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV Report
          </a>
        </div>
      )}
    </div>
  );
}
