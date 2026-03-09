/**
 * @file financeRules.ts
 * @description Single Source of Truth for all financial calculations, risk
 * assessments, and forecast visibility rules across the ERP.
 *
 * All functions here are pure (no side-effects, no DB calls) so they can be
 * safely imported by both Server Components and Server Actions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Installments overdue up to this many days are still counted in the revenue
 *  forecast (bucket: ATRASO). */
export const DIAS_TOLERANCIA_ATRASO = 14;

/** Installments overdue beyond this many days are classified as PERDA. */
export const DIAS_INADIMPLENCIA = 30;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Days-late calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns how many days late a due date is relative to a reference date.
 * Positive = overdue, 0 = due on that day, negative = future.
 *
 * Both arguments must be "YYYY-MM-DD" strings.
 */
export function calcularDiasAtraso(
    dataVencimento: string,
    dataReferenciaStr: string
): number {
    const due = new Date(dataVencimento + 'T00:00:00');
    const ref = new Date(dataReferenciaStr + 'T00:00:00');
    return Math.round((ref.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Risk classifier
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = 'EM DIA' | 'ATRASO' | 'INADIMPLENTE' | 'PERDA';

/**
 * Maps days-overdue to a risk bucket.
 *
 * ≤ 0 days  → EM DIA
 *  1–14 days → ATRASO          (tolerância)
 * 15–30 days → INADIMPLENTE
 * > 30 days  → PERDA
 */
export function getRiskStatus(diasAtraso: number): RiskLevel {
    if (diasAtraso >= 30) return 'PERDA';
    if (diasAtraso >= 15) return 'INADIMPLENTE';
    if (diasAtraso >= 1) return 'ATRASO';
    return 'EM DIA';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Soft-delete guard (cascades through contract → client)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `true` if a parcela (and its parent contract/client) is NOT
 * soft-deleted. Use this to build risk buckets that must include ≥15d late
 * installments — before applying the forecast-eligibility filter.
 *
 * @param parcela  Any shape with optional `deleted_at`, `contratos.deleted_at`,
 *                 and `contratos.clientes.deleted_at` fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotDeleted(parcela: any): boolean {
    if (parcela.deleted_at != null) return false;
    if (parcela.contratos) {
        if (parcela.contratos.deleted_at != null) return false;
        const cliente = Array.isArray(parcela.contratos.clientes)
            ? parcela.contratos.clientes[0]
            : parcela.contratos.clientes;
        if (cliente && cliente.deleted_at != null) return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Forecast eligibility filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `true` if a parcela should be counted in the revenue forecast.
 *
 * EXCLUDED if any of the following are true:
 *   - `parcela.deleted_at` is not null (soft-deleted)
 *   - `status_manual_override` is 'RENOVAR CONTRATO'
 *   - Risk bucket is 'INADIMPLENTE' or 'PERDA' (≥15 days overdue)
 *
 * INCLUDED if:
 *   - `status_manual_override` is 'PAGO'
 *   - Risk bucket is 'EM DIA' or 'ATRASO' (≤14 days overdue)
 *
 * @param parcela   Any object with the necessary fields (typed as `any` for
 *                  flexibility across different query shapes).
 * @param todayStr  Current date as "YYYY-MM-DD".
 */
export function isParcelaValidaParaPrevisao(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parcela: any,
    todayStr: string
): boolean {
    // Rule 1: installment itself is soft-deleted
    if (parcela.deleted_at != null) return false;

    // Rule 2: Soft-Delete Cascade — exclude if parent contract or client is deleted.
    // Guards against orphaned parcelas from soft-deleted contracts/clients appearing
    // in revenue forecasts. Handles both object and array Supabase join shapes.
    if (parcela.contratos) {
        if (parcela.contratos.deleted_at != null) return false;

        const cliente = Array.isArray(parcela.contratos.clientes)
            ? parcela.contratos.clientes[0]
            : parcela.contratos.clientes;

        if (cliente && cliente.deleted_at != null) return false;
    }

    const status: string = parcela.status_manual_override ?? '';

    // Rule 3: "RENOVAR CONTRATO" is not a collectible installment
    if (status === 'RENOVAR CONTRATO') return false;

    // Rule 4: always include if already paid (no risk uncertainty)
    if (status === 'PAGO') return true;

    // Rule 5: classify overdue risk and exclude INADIMPLENTE / PERDA
    const dias = calcularDiasAtraso(
        parcela.data_vencimento as string,
        todayStr
    );
    const risk = getRiskStatus(dias);

    return risk === 'EM DIA' || risk === 'ATRASO';
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Contract value recalculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the new contract total after an installment is soft-deleted
 * (EXCLUIR) or restored (RESTAURAR).
 *
 * Uses strict `Number()` parsing to prevent string-concatenation bugs and
 * clamps the result to ≥ 0 (contract value can never be negative).
 *
 * @param valorAtual   Current `valor_total_contrato` (must be a number, not a string)
 * @param valorParcela Installment `valor_previsto` being added or removed
 * @param operacao     'EXCLUIR' subtracts; 'RESTAURAR' adds
 * @returns            New contract total, always ≥ 0
 */
export function calcularNovoValorContrato(
    valorAtual: number,
    valorParcela: number,
    operacao: 'EXCLUIR' | 'RESTAURAR'
): number {
    const atual = Number(valorAtual);   // guard against accidental string input
    const parcela = Number(valorParcela);

    if (!isFinite(atual) || !isFinite(parcela)) {
        throw new Error(
            `calcularNovoValorContrato: valores inválidos — atual=${valorAtual}, parcela=${valorParcela}`
        );
    }

    const resultado =
        operacao === 'EXCLUIR'
            ? parseFloat((atual - parcela).toFixed(2))
            : parseFloat((atual + parcela).toFixed(2));

    // Contract total must never go negative
    return Math.max(0, resultado);
}
