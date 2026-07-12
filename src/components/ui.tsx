import { useEffect, useRef, type ReactNode } from "react";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { IconX } from "./Icons";

/** Shared UI primitives for the new enterprise design. */

export function Spinner({ large }: { large?: boolean }) {
  return <div className={`spinner${large ? " spinner-lg" : ""}`} />;
}

export function LoadingCenter() {
  return (
    <div className="loading-center">
      <Spinner large />
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`modal${wide ? " modal-wide" : ""}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("common.ok")}
          </button>
        </>
      }
    >
      <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
    </Modal>
  );
}

export function ToastStack() {
  const { toasts, dismissToast } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind}`}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="grow">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {subtitle && <div className="text-small text-muted">{subtitle}</div>}
      {action}
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 32,
  online,
}: {
  name: string;
  url?: string | null;
  size?: number;
  online?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        className="avatar"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {url ? <img src={url} alt={name} /> : initials || "?"}
      </div>
      {online !== undefined && (
        <span
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: Math.max(9, size * 0.28),
            height: Math.max(9, size * 0.28),
            borderRadius: "50%",
            background: online ? "var(--success)" : "var(--text-faint)",
            border: "2px solid var(--surface)",
          }}
        />
      )}
    </div>
  );
}

export function Badge({
  color,
  children,
  soft = true,
}: {
  color: string;
  children: ReactNode;
  soft?: boolean;
}) {
  return (
    <span
      className="badge"
      style={
        soft
          ? {
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
            }
          : { background: color, color: "#fff" }
      }
    >
      <span className="dot" />
      {children}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatDate(date: Date | null | undefined, lang: string): string {
  if (!date) return "—";
  return date.toLocaleDateString(lang, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | null | undefined, lang: string): string {
  if (!date) return "—";
  return date.toLocaleString(lang, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(date: Date, lang: string): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (seconds < 60) return rtf.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}
