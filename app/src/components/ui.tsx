import { useEffect, useRef, type ReactNode } from "react";
import type { SignalType } from "../types";
import { FAMILY, signalMeta } from "../data/taxonomy";

export function SignalPill({ type, points, own }: { type: SignalType; points?: number; own?: boolean }) {
  const meta = signalMeta(type, own);
  if (!meta) return null;
  const fam = FAMILY[meta.family];
  return (
    <span className="pill" title={meta.label}>
      <span className="sw" style={{ background: fam.hl, boxShadow: "inset 0 0 0 1px rgba(20,33,61,.15)" }} />
      {meta.short}
      {points !== undefined && <span className="num muted">+{points}</span>}
    </span>
  );
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, textarea, input, select, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Stat({ v, k }: { v: ReactNode; k: ReactNode }) {
  return (
    <div className="stat">
      <div className="v num">{v}</div>
      <div className="k">{k}</div>
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
