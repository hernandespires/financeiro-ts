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

// ─── Cash Flow / Clearing Days ────────────────────────────────────────────────
/**
 * Returns the date the payment will be available (cleared),
 * based on the payment method's clearing schedule.
 *
 * - STRIPE BRASIL : dataBase + 5 calendar days
 * - IUGU          : dataBase + 3 business days (Mon–Fri)
 * - Everything else (PIX, DINHEIRO, LOJA, etc.): same day (instant)
 *
 * @param dataBaseStr "YYYY-MM-DD" string (the due / payment date)
 * @param formaPagamento  payment method string from the form
 * @returns "YYYY-MM-DD" string of the clearing date
 */
export function calcularDataDisponibilidade(dataBaseStr: string, formaPagamento: string): string {
    const date = new Date(dataBaseStr + "T12:00:00");
    const forma = formaPagamento.toUpperCase();

    if (forma === "STRIPE BRASIL") {
        date.setDate(date.getDate() + 5); // 5 calendar days
    } else if (forma === "IUGU") {
        let added = 0;
        while (added < 3) {
            date.setDate(date.getDate() + 1);
            const dow = date.getDay();
            if (dow !== 0 && dow !== 6) added++; // skip Saturday (6) & Sunday (0)
        }
    }
    // PIX, DINHEIRO, LOJA, APP DE TRANSFERÊNCIA, STRIPE EUA → instant (same day)

    return date.toISOString().split("T")[0];
}

