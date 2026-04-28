"use client";

export default function Header() {
  return (
    <header className="border-bottom sticky-top" style={{ zIndex: 1030, background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div className="container-fluid container-xl">
        <div className="d-flex align-items-center justify-content-between py-3">
          
          {/* Brand */}
          <div className="d-flex align-items-center gap-3">
            <div className="d-flex align-items-center justify-content-center bg-gradient-primary rounded-3 flex-shrink-0" style={{ width: '40px', height: '40px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <div>
              <h1 className="h6 mb-0 fw-bold text-dark lh-1">Motion Movers</h1>
              <div className="text-muted small fw-normal text-uppercase" style={{ fontSize: '11px', letterSpacing: '0.5px', marginTop: '2px' }}>
                AI Detection &amp; Inventory
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="d-flex align-items-center gap-2">
            <div className="d-none d-sm-flex align-items-center gap-2 px-3 py-1 bg-success bg-opacity-10 text-success rounded-pill fw-semibold" style={{ fontSize: '12px' }}>
              <span className="bg-success rounded-circle anim-pulse-dot" style={{ width: '6px', height: '6px' }}></span>
              System Online
            </div>
            <div className="px-3 py-1 bg-light text-secondary rounded-pill fw-semibold border" style={{ fontSize: '12px' }}>
              YOLOv8n
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
