"use client";
import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  X,
  ImageOff,
  Info,
} from "lucide-react";

export function Button({
  variant = "default",
  busy = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "quiet" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "brass";
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {tone === "success" && <Check size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
export function Photo({
  src,
  alt,
  className = "",
  priority = false,
  fit = "contain",
  original = false,
  sizes = "(max-width: 700px) 90vw, (max-width: 1200px) 45vw, 32vw",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
  fit?: "cover" | "contain";
  original?: boolean;
  sizes?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={`photo ${className}`}>
      {src && failedSrc !== src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          style={{ objectFit: fit }}
          unoptimized={original || src.startsWith("/api/")}
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="photo-empty">
          <ImageOff size={28} />
          <span>{src ? "Image unavailable" : "Source image needed"}</span>
        </div>
      )}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add("dialog-open");
    } else if (dialog.open) {
      dialog.close();
      previousFocus.current?.focus();
      document.body.classList.remove("dialog-open");
    }
    return () => {
      document.body.classList.remove("dialog-open");
      if (dialog.open) {
        dialog.close();
        previousFocus.current?.focus();
      }
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">STAGECRAFT / WORKING BOOK</p>
          <h2 id={titleId}>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Notice({
  children,
  tone = "info",
  title,
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <Info size={17} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-star" aria-hidden="true">
        ✳
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="page-deck">{children}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function TextLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-link">
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </span>
  );
}
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
