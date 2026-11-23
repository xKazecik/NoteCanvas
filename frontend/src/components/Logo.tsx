import React from 'react';
import { getDesktopBridge } from '../utils/desktop';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  // A pen stroke selected on the canvas. The same in light and dark mode; the
  // master file is branding/icon.svg in the NoteCanvas-App repository.
  const mark = (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="126" height="126" rx="28" fill="#111113" stroke="#2A2A2E" strokeWidth="2" />
      <rect x="30" y="30" width="68" height="68" stroke="#818CF8" strokeWidth="3.5" />
      <path
        d="M41 82 C48 55 60 53 66 66 S 81 79 89 46"
        stroke="#F4F4F2"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g stroke="#111113" strokeWidth="3">
        <rect x="22" y="22" width="16" height="16" rx="4" fill="#2DD4BF" />
        <rect x="90" y="22" width="16" height="16" rx="4" fill="#FBBF24" />
        <rect x="22" y="90" width="16" height="16" rx="4" fill="#38BDF8" />
        <rect x="90" y="90" width="16" height="16" rx="4" fill="#F472B6" />
      </g>
    </svg>
  );

  // In the desktop app the logo opens its workspace menu.
  const desktop = getDesktopBridge();
  if (typeof desktop?.openWorkspaces !== 'function') return mark;
  return (
    <button
      type="button"
      onClick={() => desktop.openWorkspaces?.()}
      title="Workspaces"
      aria-label="Workspaces"
      className="inline-flex shrink-0 rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {mark}
    </button>
  );
};
