import { daysLate } from "./utils";

export const DIAS_TOLERANCIA_ATRASO = 14;
export const DIAS_INADIMPLENCIA = 30;

export function calcularDiasAtraso(dataVencimento: string, dataReferenciaStr: string): number {
    return daysLate(dataVencimento, dataReferenciaStr);
}

export type RiskLevel = 'EM DIA' | 'ATRASO' | 'INADIMPLENTE' | 'PERDA';

export function getRiskStatus(diasAtraso: number): RiskLevel {
    if (diasAtraso >= 30) return 'PERDA';
    if (diasAtraso >= 15) return 'INADIMPLENTE';
    if (diasAtraso >= 1) return 'ATRASO';
    return 'EM DIA';
}

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

/**
 * Scans all open parcelas and returns the Set of contrato_ids that are "dirty":
 * – have a NORMAL installment ≥15 days overdue, OR
 * – already carry a status flag that signals default (INADIMPLENTE, etc.)
 * ALL parcelas of those contracts are blocked from the forecast regardless of
 * their own individual due date.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContratosSujos(todasParcelasAbertas: any[], todayStr: string): Set<string> {
    const sujos = new Set<string>();
    for (const p of todasParcelasAbertas) {
        if (!isNotDeleted(p)) continue;

        const status = p.status_manual_override ?? '';
        if (
            status === 'INADIMPLENTE' ||
            status === 'PERDA DE FATURAMENTO' ||
            status === 'POSSUI INADIMPLENCIA'
        ) {
            if (p.contrato_id) sujos.add(p.contrato_id);
            continue;
        }

        if (status === 'NORMAL' && p.data_vencimento) {
            const dias = calcularDiasAtraso(p.data_vencimento, todayStr);
            if (dias >= 15 && p.contrato_id) {
                sujos.add(p.contrato_id);
            }
        }
    }
    return sujos;
}

/**
 * THE ABSOLUTE FIREWALL.
 *
 * Returns true ONLY if a parcela is safe to include in the cash-flow forecast.
 *
 * Rules (in order):
 *  1. Soft-deleted parcela / contract / client → OUT.
 *  2. Terminal statuses (RENOVAR CONTRATO, FINALIZAR PROJETO, QUEBRA DE CONTRATO) → OUT.
 *  3. Explicit default statuses (INADIMPLENTE, PERDA DE FATURAMENTO, POSSUI INADIMPLENCIA) → OUT.
 *  4. CROSS-DEFAULT CONTAGION: if the contract is in contratosSujos → OUT.
 *  5. PAGO / INADIMPLENTE RECEBIDO → IN (already collected, include in received totals).
 *  6. Normal overdue check: INADIMPLENTE (≥15d) / PERDA (≥30d) → OUT.
 *  7. EM DIA or ATRASO (<15d) → IN.
 */
export function isParcelaValidaParaPrevisao(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parcela: any,
    todayStr: string,
    contratosSujos?: Set<string>
): boolean {
    // Rule 1: soft-delete cascade
    if (!isNotDeleted(parcela)) return false;

    const status: string = parcela.status_manual_override ?? '';

    // Rule 2: terminal / non-billable statuses
    if (
        status === 'RENOVAR CONTRATO' ||
        status === 'FINALIZAR PROJETO' ||
        status === 'QUEBRA DE CONTRATO' ||
        status === 'RENOVADO'
    ) return false;

    // Rule 3: explicit default flags
    if (
        status === 'INADIMPLENTE' ||
        status === 'PERDA DE FATURAMENTO' ||
        status === 'POSSUI INADIMPLENCIA'
    ) return false;

    // Rule 4: CROSS-DEFAULT CONTAGION BARRIER
    // Any future/current installment of a dirty contract is blocked.
    if (status === 'NORMAL' && contratosSujos && parcela.contrato_id) {
        if (contratosSujos.has(parcela.contrato_id)) return false;
    }

    // Rule 5: already paid → include (booked revenue)
    if (status === 'PAGO' || status === 'INADIMPLENTE RECEBIDO') return true;

    // Rule 6: individual days-late check for remaining NORMAL installments
    const dias = calcularDiasAtraso(parcela.data_vencimento as string, todayStr);
    const risk = getRiskStatus(dias);

    // INADIMPLENTE (≥15d) and PERDA (≥30d) → OUT
    return risk === 'EM DIA' || risk === 'ATRASO';
}

export function calcularNovoValorContrato(
    valorAtual: number,
    valorParcela: number,
    operacao: 'EXCLUIR' | 'RESTAURAR'
): number {
    const atual = Number(valorAtual);
    const parcela = Number(valorParcela);
    if (!isFinite(atual) || !isFinite(parcela)) throw new Error("Valores inválidos");
    const resultado =
        operacao === 'EXCLUIR'
            ? parseFloat((atual - parcela).toFixed(2))
            : parseFloat((atual + parcela).toFixed(2));
    return Math.max(0, resultado);
}
