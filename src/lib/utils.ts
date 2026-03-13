// ─── Currency ─────────────────────────────────────────────────────────────────
export const brl = (v: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

// ─── Date helpers ─────────────────────────────────────────────────────────────
/** Returns "YYYY-MM-DD" from a Date object (local timezone). */
export const toDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Returns how many days late a due date is compared to today.
 * Positive = late, negative = future, 0 = due today.
 * Both args must be "YYYY-MM-DD" strings.
 */
export const daysLate = (dueDateStr: string, todayStr: string): number => {
    const due = new Date(dueDateStr + "T00:00:00");
    const tod = new Date(todayStr + "T00:00:00");
    return Math.round((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
};

/** Formats a "YYYY-MM-DD" ISO string to "DD/MM/YYYY". Returns "—" for null/undefined. */
export const fmtDate = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
};


// calcularDataDisponibilidade was moved to src/lib/financeRules.ts
// (it is a business rule, not a pure utility).
// Import it from there: import { calcularDataDisponibilidade } from '@/lib/financeRules';
