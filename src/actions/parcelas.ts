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

    revalidateAll();
    return { ok: true };
}
