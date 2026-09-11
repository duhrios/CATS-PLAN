import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  RefreshCcw,
  X,
} from "lucide-react";
import { type ReactNode } from "react";

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  type = "button",
  disabled,
  onClick,
  "data-testid": testId,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  "data-testid"?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-105 active:translate-y-px",
        variant === "secondary" &&
          "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
        variant === "danger" &&
          "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:brightness-105",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  variant = "ghost",
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${label.toLowerCase().replaceAll(" ", "-")}`}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        variant === "ghost" &&
          "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
        variant === "danger" &&
          "text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.1)]",
      )}
    >
      {children}
    </button>
  );
}

export function StatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const normalized = status.toLowerCase();
  const tone =
    normalized.includes("ready") ||
    normalized.includes("online") ||
    normalized.includes("reserved") ||
    normalized.includes("conclu") ||
    normalized.includes("completed")
      ? "good"
      : normalized.includes("use") ||
          normalized.includes("aten") ||
          normalized.includes("attention")
        ? "warm"
        : normalized.includes("cancel") ||
            normalized.includes("offline") ||
            normalized.includes("maintenance")
          ? "bad"
          : "neutral";
  return (
    <span
      data-testid={`status-${status}`}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em]",
        tone === "good" && "bg-[hsl(157_43%_43%/.12)] text-[hsl(158_43%_35%)]",
        tone === "warm" && "bg-[hsl(var(--accent)/.18)] text-[hsl(34_60%_32%)]",
        tone === "bad" &&
          "bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]",
        tone === "neutral" &&
          "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          tone === "good" && "bg-[hsl(158_43%_43%)]",
          tone === "warm" && "bg-[hsl(var(--accent))]",
          tone === "bad" && "bg-[hsl(var(--destructive))]",
          tone === "neutral" && "bg-[hsl(var(--muted-foreground))]",
        )}
      />
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}

export function SectionCard({
  children,
  className,
  title,
  action,
  eyebrow,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <section
      className={cx(
        "min-w-0 overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[0_8px_28px_hsl(187_30%_20%/.045)]",
        className,
      )}
    >
      {(title || eyebrow || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4 sm:items-end sm:px-6">
          <div>
            {eyebrow && (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.15em] text-[hsl(var(--primary))]">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="max-w-full shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-[-.03em] text-[hsl(var(--foreground))] sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="max-w-full shrink-0">{action}</div>}
    </header>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" data-testid="loading-state">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-2/5 rounded" />
            <div className="skeleton h-2.5 w-3/5 rounded" />
          </div>
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  message = "Não foi possível carregar os dados.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
      data-testid="error-state"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]">
        <AlertCircle size={20} />
      </div>
      <div>
        <p className="font-semibold text-[hsl(var(--foreground))]">
          Algo não saiu como esperado
        </p>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          data-testid="button-retry"
        >
          <RefreshCcw size={14} /> Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
      data-testid="empty-state"
    >
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
        <Check size={21} />
      </div>
      <p className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        {message}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.12)]";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(187_54%_17%/.35)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      data-testid="modal"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SavingLabel({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"
      data-testid="status-saving"
    >
      <Loader2 className="animate-spin" size={13} /> Salvando
    </span>
  );
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
export const formatTime = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
