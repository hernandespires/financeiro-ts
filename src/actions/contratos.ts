'use server'

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { registrarLog } from '@/lib/logger';
import { requireAuth } from '@/lib/authGuard';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface ActionResult {
    ok: boolean;
    error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function revalidateAll(clienteId?: string) {
    revalidatePath('/cliente/[id]', 'page');
    revalidatePath('/consultar-clientes');
    revalidatePath('/contas-a-receber');
    if (clienteId) revalidatePath(`/cliente/${clienteId}`);
}

const brlFmt = (v: number): string =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR VALOR TOTAL DO CONTRATO
// Recalculates all open ("NORMAL") installments proportionally when the
// contract total value changes. Paid installments are never touched.
// ─────────────────────────────────────────────────────────────────────────────
export async function editarValorContrato(
    contratoId: string,
    novoValorTotal: number
): Promise<ActionResult> {
    try {
        await requireAuth();
        // 1. Input sanity — prevent NaN from ever reaching the database
        if (!isFinite(novoValorTotal) || isNaN(novoValorTotal) || novoValorTotal <= 0) {
            return { ok: false, error: 'Valor total inválido. Informe um número positivo.' };
        }

        // 2. Fetch current contract (valor_total_contrato is a runtime column, not in generated types)
        const { data: contratoRaw, error: contractErr } = await supabaseAdmin
            .from('contratos')
            .select('cliente_id, valor_total_contrato')
            .eq('id', contratoId)
            .single();

        if (contractErr || !contratoRaw) {
            return { ok: false, error: contractErr?.message ?? 'Contrato não encontrado.' };
        }

        const contrato = contratoRaw as { cliente_id: string; valor_total_contrato: number };
        const oldValorTotal = parseFloat(String(contrato.valor_total_contrato ?? 0));
        const clienteId: string = contrato.cliente_id;

        // Short-circuit: no meaningful change
        if (Math.abs(novoValorTotal - oldValorTotal) < 0.01) {
            return { ok: true };
        }

        // 3. Fetch all active (non-deleted) installments for this contract
        const { data: parcelas, error: parcErr } = await supabaseAdmin
            .from('parcelas')
            .select('id, valor_previsto, status_manual_override')
            .eq('contrato_id', contratoId)
            .is('deleted_at', null);

        if (parcErr || !parcelas) {
            return { ok: false, error: parcErr?.message ?? 'Falha ao buscar parcelas do contrato.' };
        }

        // 4. Separate paid vs open installments
        const pagas = parcelas.filter(p => p.status_manual_override === 'PAGO');
        const abertas = parcelas.filter(p => p.status_manual_override === 'NORMAL');

        const totalPago = parseFloat(
            pagas.reduce((sum, p) => sum + (p.valor_previsto ?? 0), 0).toFixed(2)
        );
        const quantidadeAberta = abertas.length;

        // 5. Update the contract total first
        const { error: updateContratoErr } = await supabaseAdmin
            .from('contratos')
            .update({ valor_total_contrato: novoValorTotal } as any)
            .eq('id', contratoId);

        if (updateContratoErr) {
            return { ok: false, error: `Falha ao atualizar contrato: ${updateContratoErr.message}` };
        }

        let logExtra: string;

        if (quantidadeAberta === 0) {
            logExtra = 'Nenhuma parcela em aberto para reajustar.';
        } else {
            // 6. Financial redistribution math
            const saldoRestante = parseFloat((novoValorTotal - totalPago).toFixed(2));
            const novoValorParcela = parseFloat((saldoRestante / quantidadeAberta).toFixed(2));

            // Strict NaN / negative guard before any DB write
            if (isNaN(novoValorParcela) || !isFinite(novoValorParcela)) {
                return { ok: false, error: 'Cálculo do novo valor de parcela resultou em NaN. Verifique os dados.' };
            }
            if (novoValorParcela < 0) {
                return {
                    ok: false,
                    error: `Saldo restante insuficiente (${brlFmt(saldoRestante)}) para cobrir ${quantidadeAberta} parcela(s). `
                        + `O novo total deve ser superior ao valor já pago (${brlFmt(totalPago)}).`,
                };
            }

            // 7. Batch-update all open installments
            const { error: updateParcErr } = await supabaseAdmin
                .from('parcelas')
                .update({ valor_previsto: novoValorParcela })
                .in('id', abertas.map(p => p.id));

            if (updateParcErr) {
                return { ok: false, error: `Falha ao atualizar parcelas: ${updateParcErr.message}` };
            }

            logExtra = `${quantidadeAberta} parcela(s) em aberto reajustadas para ${brlFmt(novoValorParcela)} cada.`;
        }

        // 8. Detailed audit log
        const logMsg =
            `Valor total do contrato alterado de ${brlFmt(oldValorTotal)} para ${brlFmt(novoValorTotal)}. ${logExtra}`;
        await registrarLog(clienteId, 'CONTRATOS', logMsg);

        revalidateAll(clienteId);
        return { ok: true };

    } catch (err: any) {
        console.error('[editarValorContrato] Exceção não tratada:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
}
