"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";

// ─── Shared revalidation ──────────────────────────────────────────────────────
function revalidateAll(clienteId?: string) {
    revalidatePath("/cliente/[id]", "page");
    revalidatePath("/consultar-clientes");
    revalidatePath("/contas-a-receber");
    if (clienteId) revalidatePath(`/cliente/${clienteId}`);
}

// ─── Action result type ───────────────────────────────────────────────────────
export interface ActionResult {
    ok: boolean;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTRAR PAGAMENTO COMPLETO
//    Marks a parcela as PAGO and records a ledger entry in `pagamentos`.
// ─────────────────────────────────────────────────────────────────────────────
export async function registrarPagamentoCompleto(
    parcelaId: string,
    valorPago: number,
    dataPagamento: string,    // "YYYY-MM-DD"
    plataforma: string,       // e.g. "PIX", "IUGU", "STRIPE BRASIL", "STRIPE EUA"
    observacao?: string
): Promise<ActionResult> {
    // Step 1: mark parcela as PAGO
    const { error: updateError } = await supabaseAdmin
        .from("parcelas")
        .update({ status_manual_override: "PAGO" as any, observacao: observacao || null })
        .eq("id", parcelaId);

    if (updateError) {
        console.error("[registrarPagamentoCompleto] Erro ao atualizar parcela:", updateError.message);
        return { ok: false, error: updateError.message };
    }

    // Step 2: insert ledger entry into `pagamentos`
    const { error: insertError } = await supabaseAdmin
        .from("pagamentos")
        .insert({
            parcela_id: parcelaId,
            data_pagamento: dataPagamento,
            disponivel_em: dataPagamento,
            valor_pago: valorPago,
            plataforma: plataforma as any,     // cast: enum_plataforma
            status_pagamento: "RECEBIDO" as any,     // cast: enum_status_pagamento
        });

    if (insertError) {
        console.error("[registrarPagamentoCompleto] Erro ao inserir pagamento:", insertError.message);
        // Parcela already marked PAGO — surface the error but don't roll back
        return { ok: false, error: `Parcela marcada como PAGO, mas falha ao gravar histórico: ${insertError.message}` };
    }

    // Step 3: log the action against the client's CRM tab
    const { data: pData } = await supabaseAdmin
        .from('parcelas')
        .select('numero_referencia, contratos(cliente_id)')
        .eq('id', parcelaId)
        .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clienteId = (pData?.contratos as any)?.cliente_id;
    const numero_referencia = pData?.numero_referencia ?? parcelaId;

    if (clienteId) {
        await registrarLog(
            clienteId,
            'PARCELAS',
            `Deu baixa na parcela ${numero_referencia} — Valor: R$ ${valorPago.toFixed(2)} via ${plataforma}`
        );
    }

    revalidateAll();
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DESMEMBRAR PARCELA
//    Splits a parcela into two: the original keeps `novoValorPrimeira` (sub_indice = 1)
//    and a new sibling gets the remaining balance (sub_indice = 2, status = NORMAL).
// ─────────────────────────────────────────────────────────────────────────────
export async function desmembrarParcela(
    parcelaId: string,
    novoValorPrimeira: number
): Promise<ActionResult> {
    // Step 1: fetch original parcela
    const { data: original, error: fetchError } = await supabaseAdmin
        .from("parcelas")
        .select(
            "id, contrato_id, numero_referencia, data_vencimento, tipo_parcela, categoria, observacao, valor_previsto, sub_indice"
        )
        .eq("id", parcelaId)
        .single();

    if (fetchError || !original) {
        console.error("[desmembrarParcela] Parcela não encontrada:", fetchError?.message);
        return { ok: false, error: fetchError?.message ?? "Parcela não encontrada." };
    }

    // Guard: prevent splitting a sub-installment (already produced by a prior split)
    if (original.sub_indice !== null && original.sub_indice > 0) {
        return {
            ok: false,
            error: "Não é possível dividir uma parcela que já foi dividida (sub-parcela).",
        };
    }

    const saldoRestante = Number(
        (original.valor_previsto - novoValorPrimeira).toFixed(2)
    );

    if (saldoRestante <= 0) {
        return {
            ok: false,
            error: "O novo valor da primeira parcela deve ser menor que o valor original.",
        };
    }

    // Step 2: update original parcela with the new partial value and sub_indice = 1
    const { error: updateError } = await supabaseAdmin
        .from("parcelas")
        .update({
            valor_previsto: novoValorPrimeira,
            sub_indice: 1,
        })
        .eq("id", parcelaId);

    if (updateError) {
        console.error("[desmembrarParcela] Erro ao atualizar original:", updateError.message);
        return { ok: false, error: updateError.message };
    }

    // Step 3: insert sibling parcela with the remaining balance
    const { error: insertError } = await supabaseAdmin
        .from("parcelas")
        .insert({
            contrato_id: original.contrato_id,
            numero_referencia: original.numero_referencia,
            data_vencimento: original.data_vencimento,
            tipo_parcela: original.tipo_parcela,
            categoria: original.categoria,
            observacao: original.observacao
                ? `${original.observacao} (saldo)`
                : "Saldo desmembrado",
            valor_previsto: saldoRestante,
            sub_indice: 2,
            status_manual_override: "NORMAL" as any,
        });

    if (insertError) {
        console.error("[desmembrarParcela] Erro ao inserir parcela filha:", insertError.message);
        return {
            ok: false,
            error: `Original atualizado, mas falha ao criar parcela saldo: ${insertError.message}`,
        };
    }

    // Step 4: resolve cliente_id for audit log
    const { data: contratoData } = await supabaseAdmin
        .from('contratos')
        .select('cliente_id')
        .eq('id', original.contrato_id)
        .single();

    const clienteId = (contratoData as any)?.cliente_id;
    const brlFmt = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    if (clienteId) {
        await registrarLog(
            clienteId,
            'PARCELAS',
            `Dividiu a parcela ${original.numero_referencia} em 2: ` +
            `${brlFmt(novoValorPrimeira)} (parte 1) + ${brlFmt(saldoRestante)} (parte 2)`
        );
    }

    revalidateAll(clienteId);
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EDITAR PARCELA
//    Fetches OLD values for diff logging, propagates value change to the parent
//    contrato.valor_total_contrato, then logs a rich human-readable audit entry.
//    Blocked if a pagamento record already exists for this installment.
// ─────────────────────────────────────────────────────────────────────────────
export async function editarParcela(
    id: string,
    novoValor: number,
    novaDataVencimento: string
): Promise<ActionResult> {
    try {
        // Guard: abort if already paid
        const { data: pag } = await supabaseAdmin
            .from('pagamentos')
            .select('id')
            .eq('parcela_id', id)
            .maybeSingle();

        if (pag) {
            return { ok: false, error: "Esta parcela já possui pagamento registrado e não pode ser editada." };
        }

        // Input sanity — block NaN before it ever reaches the DB
        if (!isFinite(novoValor) || isNaN(novoValor) || novoValor <= 0) {
            return { ok: false, error: 'Valor inválido.' };
        }

        // Fetch OLD installment data for diffing and contract adjustment
        const { data: old, error: fetchError } = await supabaseAdmin
            .from('parcelas')
            .select('valor_previsto, data_vencimento, numero_referencia, sub_indice, contrato_id, contratos(cliente_id)')
            .eq('id', id)
            .single();

        if (fetchError || !old) {
            return { ok: false, error: fetchError?.message ?? "Parcela não encontrada." };
        }

        // ── Build human-readable change description ───────────────────────────
        const brlFmt = (v: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const dateFmt = (s: string) => {
            const [y, m, d] = s.split('-');
            return `${d}/${m}`;
        };

        const changes: string[] = [];
        const oldValor = old.valor_previsto;
        const diferenca = parseFloat((novoValor - oldValor).toFixed(2));

        if (Math.abs(diferenca) > 0.001) {
            changes.push(`Valor de ${brlFmt(oldValor)} para ${brlFmt(novoValor)}`);
        }
        if (novaDataVencimento !== old.data_vencimento) {
            changes.push(`Vencimento de ${dateFmt(old.data_vencimento)} para ${dateFmt(novaDataVencimento)}`);
        }

        const ref = old.sub_indice
            ? `${old.numero_referencia}-${old.sub_indice}`
            : `${old.numero_referencia}`;

        // ── Apply update to parcela ───────────────────────────────────────────
        const { error: updateError } = await supabaseAdmin
            .from('parcelas')
            .update({ valor_previsto: novoValor, data_vencimento: novaDataVencimento })
            .eq('id', id);

        if (updateError) return { ok: false, error: updateError.message };

        // ── Financial adjustment: propagate diff to parent contrato ───────────
        if (Math.abs(diferenca) > 0.001) {
            const { data: ct } = await supabaseAdmin
                .from('contratos')
                .select('valor_total_contrato')
                .eq('id', old.contrato_id)
                .single();

            const currentTotal = parseFloat(String((ct as any)?.valor_total_contrato ?? NaN));

            if (!isNaN(currentTotal) && isFinite(currentTotal)) {
                const novoTotal = parseFloat((currentTotal + diferenca).toFixed(2));
                await supabaseAdmin
                    .from('contratos')
                    .update({ valor_total_contrato: novoTotal } as any)
                    .eq('id', old.contrato_id);
            }
        }

        // ── Audit log ─────────────────────────────────────────────────────────
        const clienteId = (old.contratos as any)?.cliente_id;
        if (clienteId) {
            const logMsg = changes.length > 0
                ? `Editou a parcela ${ref}: ${changes.join(' | ')}`
                : `Editou a parcela ${ref} (sem alterações no valor ou vencimento)`;
            await registrarLog(clienteId, 'PARCELAS', logMsg);
        }

        revalidateAll(clienteId);
        return { ok: true };

    } catch (err: any) {
        console.error('[editarParcela] Exceção não tratada:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOFT DELETE PARCELA
//    Sets deleted_at. Blocked if a payment record exists.
// ─────────────────────────────────────────────────────────────────────────────
export async function softDeleteParcela(id: string): Promise<ActionResult> {
    // Guard: abort if already paid
    const { data: pag } = await supabaseAdmin
        .from('pagamentos')
        .select('id')
        .eq('parcela_id', id)
        .maybeSingle();

    if (pag) {
        return { ok: false, error: "Esta parcela já possui pagamento registrado e não pode ser excluída." };
    }

    // Fetch context for logging
    const { data: parcela, error: fetchError } = await supabaseAdmin
        .from('parcelas')
        .select('numero_referencia, sub_indice, contratos(cliente_id)')
        .eq('id', id)
        .single();

    if (fetchError || !parcela) {
        return { ok: false, error: fetchError?.message ?? "Parcela não encontrada." };
    }

    const { error } = await supabaseAdmin
        .from('parcelas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return { ok: false, error: error.message };

    const clienteId = (parcela.contratos as any)?.cliente_id;
    const ref = parcela.sub_indice
        ? `${parcela.numero_referencia}-${parcela.sub_indice}`
        : `${parcela.numero_referencia}`;

    if (clienteId) {
        await registrarLog(clienteId, 'PARCELAS', `Excluiu a parcela ${ref} logicamente`);
    }

    revalidateAll(clienteId);
    return { ok: true };
}
