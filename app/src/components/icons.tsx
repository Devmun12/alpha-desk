import type { SVGProps } from "react";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconBrief = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const IconDesk = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 5h16M4 12h10M4 19h7" /><path d="m15 17 2 2 4-4" /></svg>
);
export const IconPlays = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5" /></svg>
);
export const IconImpact = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const IconPipeline = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8M18 8l-5 8" /></svg>
);
export const IconRead = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 14h4" strokeWidth="4" stroke="var(--hl-comp)" /><path d="M8 17h7" /></svg>
);
export const IconAbout = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconExternal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={14} height={14} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><path d="m5 12 4 4 10-10" /></svg>
);
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={14} height={14} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
);
export const IconUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4.3-7.5A2 2 0 0 1 15 4.6z" /></svg>
);
export const IconDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><path d="M17 14V3M9 18.1l1 4.1H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4.3 7.5A2 2 0 0 1 9 19.4z" /></svg>
);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={18} height={18} {...p}><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconSlack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={16} height={16} {...p}><path d="M14.5 10a1.5 1.5 0 0 1 0-3H17a1.5 1.5 0 0 1 0 3zM10 9.5a1.5 1.5 0 0 1-3 0V7a1.5 1.5 0 0 1 3 0zM9.5 14a1.5 1.5 0 0 1 0 3H7a1.5 1.5 0 0 1 0-3zM14 14.5a1.5 1.5 0 0 1 3 0V17a1.5 1.5 0 0 1-3 0z" /></svg>
);

export function Mark({ size = 34 }: { size?: number }) {
  // A job-post card with one highlighted line: the product in one glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="5" y="4" width="24" height="26" rx="4" fill="#fff" />
      <rect x="9" y="10" width="16" height="5" rx="2" fill="var(--hl-comp)" />
      <path d="M10 12.5h14M10 19h12M10 24h8" stroke="#14213d" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
