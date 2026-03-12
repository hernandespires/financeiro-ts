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
 * Scans all open parcelas and returns the Set of contrato_ids that are "dirty".
 * Recognizes both legacy POSSUI INADIMPLENCIA and new EM_INADIMPLENCIA / EM_PERDA_FATURAMENTO.
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
            status === 'POSSUI INADIMPLENCIA' ||
            status === 'EM_INADIMPLENCIA' ||
            status === 'EM_PERDA_FATURAMENTO'
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
 */
export function isParcelaValidaParaPrevisao(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parcela: any,
    todayStr: string,
    contratosSujos?: Set<string>
): boolean {
    if (!isNotDeleted(parcela)) return false;

    const status: string = parcela.status_manual_override ?? '';

    // Terminal / non-billable statuses
    if (
        status === 'RENOVAR CONTRATO' ||
        status === 'FINALIZAR PROJETO' ||
        status === 'QUEBRA DE CONTRATO' ||
        status === 'RENOVADO'
    ) return false;

    // Explicit default flags (including new DB-driven statuses)
    if (
        status === 'INADIMPLENTE' ||
        status === 'PERDA DE FATURAMENTO' ||
        status === 'POSSUI INADIMPLENCIA' ||
        status === 'EM_INADIMPLENCIA' ||
        status === 'EM_PERDA_FATURAMENTO'
    ) return false;

    // CROSS-DEFAULT CONTAGION BARRIER
    if (status === 'NORMAL' && contratosSujos && parcela.contrato_id) {
        if (contratosSujos.has(parcela.contrato_id)) return false;
    }

    // Already paid → include (booked revenue)
    if (status === 'PAGO' || status === 'INADIMPLENTE RECEBIDO') return true;

    // Individual days-late check for remaining NORMAL/ATRASADO installments
    const dias = calcularDiasAtraso(parcela.data_vencimento as string, todayStr);
    const risk = getRiskStatus(dias);

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

// ────────────────────────────────────────────────────────────────────────────
// DATABASE SYNCHRONIZATION — THE SINGLE SOURCE OF TRUTH ENGINE
// ────────────────────────────────────────────────────────────────────────────
/**
 * Strict Contagion Rules (enforced in DB, not just UI):
 *
 * - 1–14 days late  → parcela = ATRASADO,  cliente worst = ATRASADO
 * - 15–29 days late → parcela = INADIMPLENTE, subsequent open parcelas of same contract = EM_INADIMPLENCIA, cliente worst = INADIMPLENTE
 * - ≥ 30 days late  → parcela = PERDA DE FATURAMENTO, subsequent = EM_PERDA_FATURAMENTO, cliente worst = PERDA DE FATURAMENTO
 *
 * Parcelas already PAGO / INADIMPLENTE RECEBIDO are never touched.
 * Non-billable terminal statuses (RENOVAR CONTRATO etc.) are never touched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncFinanceStatuses(supabaseAdmin: any): Promise<{ ok: boolean, error?: string }> {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // Fetch all open (non-paid, non-deleted) parcelas grouped by client → contract
        const { data: clientes, error: fetchErr } = await supabaseAdmin
            .from('clientes')
            .select(`
                id,
                status_cliente,
                contratos (
                    id,
                    parcelas (
                        id,
                        data_vencimento,
                        status_manual_override,
                        deleted_at,
                        numero_referencia
                    )
                )
            `)
            .is('deleted_at', null);

        if (fetchErr) throw fetchErr;
        if (!clientes || clientes.length === 0) return { ok: true };

        // Rank severity of client-level statuses
        const rank: Record<string, number> = {
            'ATIVO': 0,
            'ATRASADO': 1,
            'INADIMPLENTE': 2,
            'PERDA DE FATURAMENTO': 3,
        };

        // Statuses that should NEVER be touched by automatic sync
        const PROTECTED_STATUSES = new Set([
            'PAGO', 'INADIMPLENTE RECEBIDO',
            'RENOVAR CONTRATO', 'FINALIZAR PROJETO',
            'QUEBRA DE CONTRATO', 'RENOVADO',
        ]);

        const parcelasUpdates: { id: string; status_manual_override: string }[] = [];
        const clientesUpdates: { id: string; status_cliente: string }[] = [];

        for (const cliente of clientes) {
            let worstClientStatus = 'ATIVO';

            const contratos = (cliente.contratos || []) as any[];

            for (const contrato of contratos) {
                // Only consider non-deleted, non-protected parcelas
                const openParcelas = ((contrato.parcelas || []) as any[])
                    .filter((p: any) => !p.deleted_at && !PROTECTED_STATUSES.has(p.status_manual_override || ''))
                    .sort((a: any, b: any) => {
                        // Primary sort: data_vencimento, secondary: numero_referencia
                        const d = (a.data_vencimento || '').localeCompare(b.data_vencimento || '');
                        return d !== 0 ? d : (a.numero_referencia ?? 0) - (b.numero_referencia ?? 0);
                    });

                // Two-pass approach:
                // Pass 1: Find the first/worst overdue parcela and its severity.
                // Pass 2: Apply contagion to all subsequent parcelas.

                let contagionStatus: string | null = null;  // what to force on subsequent parcelas
                let worstContractStatus: string | null = null; // worst status found in this contract

                // Pass 1 – establish the "root" overdue status for each parcela
                const resolvedStatuses = openParcelas.map((p: any) => {
                    const currentStatus = p.status_manual_override || 'NORMAL';

                    // If already contaminated from a previous sync, recompute from days-late
                    // to keep it up to date (a 15d-late parcela now becomes 30d-late = PERDA)
                    const relevantStatuses = ['NORMAL', 'ATRASADO', 'INADIMPLENTE', 'PERDA DE FATURAMENTO', 'EM_INADIMPLENCIA', 'EM_PERDA_FATURAMENTO'];
                    if (!relevantStatuses.includes(currentStatus)) return { p, newStatus: currentStatus, isRoot: false };

                    const dias = daysLate(p.data_vencimento, todayStr);

                    // Not late
                    if (dias <= 0) {
                        return { p, newStatus: 'NORMAL', isRoot: false };
                    }

                    // Late — this is a ROOT overdue parcela
                    let rootStatus: string;
                    if (dias >= 30) {
                        rootStatus = 'PERDA DE FATURAMENTO';
                    } else if (dias >= 15) {
                        rootStatus = 'INADIMPLENTE';
                    } else {
                        rootStatus = 'ATRASADO';
                    }
                    return { p, newStatus: rootStatus, isRoot: true, dias };
                });

                // Pass 2 – apply contagion forward from the WORST root
                let contagionActive = false;
                let currentContagion: string | null = null;

                for (const item of resolvedStatuses) {
                    if (contagionActive && currentContagion) {
                        // This parcela is after a defaulted one → contaminate
                        item.newStatus = currentContagion;
                    } else if (item.isRoot) {
                        // This is the root overdue parcela — set contagion for everything after
                        if (item.newStatus === 'PERDA DE FATURAMENTO') {
                            currentContagion = 'EM_PERDA_FATURAMENTO';
                        } else if (item.newStatus === 'INADIMPLENTE') {
                            currentContagion = 'EM_INADIMPLENCIA';
                        }
                        // ATRASADO doesn't contaminate subsequent parcelas
                        contagionActive = currentContagion !== null;
                    }
                }

                // Determine worst contract status for the client
                for (const item of resolvedStatuses) {
                    const ns = item.newStatus;
                    if (ns === 'PERDA DE FATURAMENTO' || ns === 'EM_PERDA_FATURAMENTO') {
                        if (rank['PERDA DE FATURAMENTO'] > rank[worstClientStatus]) {
                            worstClientStatus = 'PERDA DE FATURAMENTO';
                        }
                        if (!worstContractStatus || rank['PERDA DE FATURAMENTO'] > rank[worstContractStatus]) {
                            worstContractStatus = 'PERDA DE FATURAMENTO';
                        }
                    } else if (ns === 'INADIMPLENTE' || ns === 'EM_INADIMPLENCIA') {
                        if (rank['INADIMPLENTE'] > rank[worstClientStatus]) {
                            worstClientStatus = 'INADIMPLENTE';
                        }
                    } else if (ns === 'ATRASADO') {
                        if (rank['ATRASADO'] > rank[worstClientStatus]) {
                            worstClientStatus = 'ATRASADO';
                        }
                    }
                }

                // Collect parcela updates only for rows that actually changed
                for (const item of resolvedStatuses) {
                    const oldStatus = item.p.status_manual_override || 'NORMAL';
                    if (item.newStatus !== oldStatus) {
                        parcelasUpdates.push({ id: item.p.id, status_manual_override: item.newStatus });
                    }
                }
            }

            // Collect client update only if status changed
            const currentClientStatus = cliente.status_cliente || 'ATIVO';
            if (worstClientStatus !== currentClientStatus) {
                clientesUpdates.push({ id: cliente.id, status_cliente: worstClientStatus });
            }
        }

        // Batch UPDATE parcelas — use individual .update().eq() to avoid
        // not-null constraint violations that .upsert() causes with partial objects
        if (parcelasUpdates.length > 0) {
            console.log(`[syncFinanceStatuses] Updating ${parcelasUpdates.length} parcela(s)...`);
            await Promise.all(
                parcelasUpdates.map(({ id, status_manual_override }) =>
                    supabaseAdmin
                        .from('parcelas')
                        .update({ status_manual_override })
                        .eq('id', id)
                        .then(({ error }: { error: any }) => {
                            if (error) console.error(`[syncFinanceStatuses] parcela ${id} error:`, error.message);
                        })
                )
            );
        }

        // Batch UPDATE clientes — same reasoning
        if (clientesUpdates.length > 0) {
            console.log(`[syncFinanceStatuses] Updating ${clientesUpdates.length} client(s)...`);
            await Promise.all(
                clientesUpdates.map(({ id, status_cliente }) =>
                    supabaseAdmin
                        .from('clientes')
                        .update({ status_cliente })
                        .eq('id', id)
                        .then(({ error }: { error: any }) => {
                            if (error) console.error(`[syncFinanceStatuses] cliente ${id} error:`, error.message);
                        })
                )
            );
        }

        return { ok: true };

    } catch (err: any) {
        console.error('[syncFinanceStatuses] Critical failure:', err);
        return { ok: false, error: err.message };
    }
}

