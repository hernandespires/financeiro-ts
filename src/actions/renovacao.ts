'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { calcularDataDisponibilidade } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/authGuard';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RenovarContratoInput {
    /** The RENOVAR CONTRATO parcela to mark as RENOVADO */
    parcelaRenovacaoId: string;
    /** The existing contract to read forma_pagamento and client context from */
    contratoAntigoId: string;
    /** The client who owns the old contract */
    clienteId: string;
    /** New renewal period in months */
    novo_periodo_meses: number;
    /** New total contract value */
    novo_valor_total: number;
}

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Renews a contract (RENOVAR CONTRATO installment → RENOVADO) and creates a
 * brand-new RECORRENTE contract + monthly installments for the same client.
 *
 * Steps:
 *  1. Fetch old contract for forma_pagamento / agencia / sdr / closer context.
 *  2. Mark the RENOVAR CONTRATO parcela as RENOVADO.
 *  3. Insert a new `contratos` row linked to the same client.
 *  4. Generate `novo_periodo_meses` monthly installments + a new renewal marker.
 *  5. Revalidate page cache.
 */
export async function renovarContrato(
    input: RenovarContratoInput
): Promise<{ ok: boolean; error?: string }> {
    const { parcelaRenovacaoId, contratoAntigoId, clienteId, novo_periodo_meses, novo_valor_total } = input;

    try {
        await requireAuth();
        // ── 1. Fetch old contract ─────────────────────────────────────────────
        const { data: contratoAntigo, error: errFetch } = await supabaseAdmin
            .from('contratos')
            .select('forma_pagamento, agencia_id, sdr_id, closer_id, programa_id, data_inicio')
            .eq('id', contratoAntigoId)
            .single();

        if (errFetch || !contratoAntigo) {
            throw new Error(`Contrato antigo não encontrado: ${errFetch?.message ?? 'null'}`);
        }

        const forma_pagamento: string = contratoAntigo.forma_pagamento ?? 'PIX';
        const valor_parcela = Number((novo_valor_total / novo_periodo_meses).toFixed(2));

        // ── 2. Mark old renewal marker as RENOVADO ────────────────────────────
        const { error: errMark } = await supabaseAdmin
            .from('parcelas')
            .update({ status_manual_override: 'RENOVADO' })
            .eq('id', parcelaRenovacaoId);

        if (errMark) throw new Error(`Erro ao marcar parcela como RENOVADO: ${errMark.message}`);

        // ── 3. Create new contract ─────────────────────────────────────────────
        // The new contract starts the month after today, on the same day-of-month
        // as the original contract start.
        const hoje = new Date();
        const dataInicioOriginal = new Date(`${contratoAntigo.data_inicio}T12:00:00Z`);
        const dataInicioNovo = new Date(Date.UTC(
            hoje.getUTCFullYear(),
            hoje.getUTCMonth() + 1,
            dataInicioOriginal.getUTCDate()
        ));
        const dataInicioStr = dataInicioNovo.toISOString().split('T')[0];

        const { data: novoContrato, error: errContrato } = await supabaseAdmin
            .from('contratos')
            .insert({
                cliente_id: clienteId,
                agencia_id: contratoAntigo.agencia_id,
                sdr_id: contratoAntigo.sdr_id,
                closer_id: contratoAntigo.closer_id,
                programa_id: contratoAntigo.programa_id,
                tipo_contrato: 'RECORRENTE',
                periodicidade: 'MENSAL',
                data_inicio: dataInicioStr,
                valor_total_contrato: novo_valor_total,
                valor_base_parcela: valor_parcela,
                parcelas_total: novo_periodo_meses,
                imposto_percentual: 0,
                cnpj_vinculado: null,
                forma_pagamento,
            })
            .select('id')
            .single();

        if (errContrato || !novoContrato) {
            throw new Error(`Erro ao criar novo contrato: ${errContrato?.message ?? 'null'}`);
        }

        // ── 4. Generate installments ──────────────────────────────────────────
        const parcelas: Record<string, unknown>[] = [];
        let dataVenc = new Date(`${dataInicioStr}T12:00:00Z`);

        for (let i = 1; i <= novo_periodo_meses; i++) {
            const dateStr = dataVenc.toISOString().split('T')[0];
            parcelas.push({
                contrato_id: novoContrato.id,
                numero_referencia: i,
                sub_indice: 0,
                data_vencimento: dateStr,
                valor_bruto: valor_parcela,
                valor_previsto: valor_parcela,
                tipo_parcela: 'CONTRATO',
                categoria: i === 1 ? 'RENOVAÇÕES' : 'BASE',
                status_manual_override: 'NORMAL',
                observacao: `Renovação — parcela ${i}/${novo_periodo_meses}`,
                data_disponibilidade_prevista: calcularDataDisponibilidade(dateStr, forma_pagamento),
            });
            dataVenc.setMonth(dataVenc.getMonth() + 1);
        }

        // Renewal marker for the NEW contract
        const dataFim = new Date(`${dataInicioStr}T12:00:00Z`);
        dataFim.setMonth(dataFim.getMonth() + novo_periodo_meses);

        parcelas.push({
            contrato_id: novoContrato.id,
            numero_referencia: parcelas.length + 1,
            sub_indice: 0,
            data_vencimento: dataFim.toISOString().split('T')[0],
            valor_bruto: 0,
            valor_previsto: 0,
            tipo_parcela: 'ADICIONAL',
            categoria: 'RENOVAÇÕES',
            status_manual_override: 'RENOVAR CONTRATO',
            observacao: 'Término do contrato renovado',
        });

        const { error: errParcelas } = await supabaseAdmin
            .from('parcelas')
            .insert(parcelas);

        if (errParcelas) throw new Error(`Erro ao gerar parcelas: ${errParcelas.message}`);

        // ── 5. Revalidate ─────────────────────────────────────────────────────
        revalidatePath('/contas-a-receber');
        revalidatePath(`/cliente/${clienteId}`);

        console.log(`[renovarContrato] Sucesso: ${novo_periodo_meses} parcelas geradas para contrato ${novoContrato.id}`);
        return { ok: true };

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[renovarContrato] Erro:', msg);
        return { ok: false, error: msg };
    }
}
