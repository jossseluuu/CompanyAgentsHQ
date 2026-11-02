import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { t } from "@/shared/i18n";

export function Button({
  tone = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "danger" }) {
  const tones = {
    default: "bg-ink-soft hover:bg-ink-line text-slate-100 border-ink-line",
    primary: "bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white border-indigo-500 shadow-sm",
    danger: "bg-red-600 hover:bg-red-500 text-white border-red-500",
  };
  return (
    <button
      type="button"
      {...props}
      className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded border border-ink-line bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-400 transition-colors hover:border-slate-500 focus:border-indigo-400";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-ink-line">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-2.5 py-1.5 text-sm font-medium transition-colors ${
            tab.key === active ? "border-indigo-400 text-slate-50" : "border-transparent text-slate-300 hover:text-slate-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-ink-line px-4 py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded border border-red-800 bg-red-950 p-2.5 text-sm text-red-100">
      {t(error instanceof Error ? error.message : String(error))}
    </p>
  );
}

const TASK_STATUS: Record<string, string> = {
  pending: t("Pendiente"),
  in_progress: t("En curso"),
  in_review: t("En revisión"),
  blocked: t("Bloqueada"),
  done: t("Hecha"),
  failed: t("Fallida"),
  cancelled: t("Cancelada"),
  planning: t("Planificando"),
  plan_review: t("Plan por revisar"),
  running: t("En marcha"),
  rejected: t("Rechazado"),
};

export const statusLabel = (status: string) => TASK_STATUS[status] ?? status;

export function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-ink-line px-2 py-0.5 text-xs font-medium text-slate-100">{children}</span>;
}

/** Barras de una sola serie: el título nombra la serie y cada barra lleva su valor al pasar el ratón. */
export function BarChart({
  title,
  rows,
  unit = "€",
}: {
  title: string;
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 0.000001);
  if (!rows.length) return <Empty>{title}{t(": sin datos todavía")}</Empty>;
  const shown = hover === null ? rows[rows.length - 1] : rows[hover];
  return (
    <figure>
      <figcaption className="mb-1 flex justify-between text-sm text-slate-300">
        <span>{title}</span>
        <span className="tabular-nums text-slate-100">
          {shown.label}: {shown.value.toFixed(4)} {unit}
        </span>
      </figcaption>
      <div className="flex h-24 items-end gap-0.5 border-b border-ink-line" onMouseLeave={() => setHover(null)}>
        {rows.map((row, index) => (
          <div
            key={row.label}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(index)}
            title={`${row.label}: ${row.value.toFixed(4)} ${unit}`}
          >
            <div
              className={`w-full rounded-t ${index === hover ? "bg-indigo-300" : "bg-indigo-400"}`}
              style={{ height: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <details className="mt-1 text-xs text-slate-300">
        <summary>{t("Ver tabla")}</summary>
        <table className="w-full">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="text-right tabular-nums">
                  {row.value.toFixed(4)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
