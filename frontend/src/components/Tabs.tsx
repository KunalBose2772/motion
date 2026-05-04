"use client";

import type { ReactNode } from "react";
import type { TabId } from "@/types";

interface TabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: "upload",
    label: "Media Upload",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="me-2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    id: "live",
    label: "Live Camera",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="me-2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
];


export default function Tabs({ activeTab, onTabChange }: TabsProps) {
  return (
    <ul className="nav nav-pills bg-light p-1 rounded-3 d-inline-flex border flex-nowrap overflow-auto no-scrollbar">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <li className="nav-item flex-grow-1" key={tab.id}>
            <button
              onClick={() => onTabChange(tab.id)}
              className={`nav-link d-flex align-items-center justify-content-center h-100 text-nowrap ${active ? 'active bg-white text-primary shadow-sm' : 'text-secondary'}`}
              style={{ padding: '0.4rem 1rem', fontSize: 'clamp(12px, 3vw, 14px)' }}
            >
              {tab.icon}
              {tab.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
