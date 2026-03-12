"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { calcularNovoValorContrato } from "@/lib/financeRules";
import { calcularDataDisponibilidade } from "@/lib/utils";
import { requireAuth } from "@/lib/authGuard";

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
//    Marks a parcela as PAGO, records a ledger entry in `pagamentos`, and
//    triggers a "Ripple Effect" when the payment platform differs from the
//    contract's default: it updates the contract and recalculates the
//    data_disponibilidade_prevista for ALL open (NORMAL) parcelas.
// ─────────────────────────────────────────────────────────────────────────────
export async function registrarPagamentoCompleto(
    parcelaId: string,
    valorPago: number,        // O que o cliente enviou pra plataforma (o que saiu do bolso dele, ou o valor bruto se ele mandou integral)
    taxaPlataforma: number,   // Retenção do gateway de pgto (Stripe/Iugu/PIX)
    impostoRetido: number,    // Imposto NF %
    valorLiquidoReal: number, // O que de fato sobrou pra ts (valorPago - impostoRetido)
    jurosAplicado: number,    // Juros por atraso
    dataPagamento: string,    // "YYYY-MM-DD"
    plataforma: string,       // e.g. "PIX", "IUGU", "STRIPE BRASIL", "STRIPE EUA"
    observacao?: string,
    anexoUrl?: string,        // URL of the uploaded receipt
    novoValorBruto?: number   // (Optional) Updated valor_bruto if juros was added
): Promise<ActionResult> {
    try {
        await requireAuth();
        // ── Step 1: Fetch context — need numero_referencia, contrato, client, and current bruto ──
        const { data: parcela, error: fetchErr } = await supabaseAdmin
            .from('parcelas')
            .select('numero_referencia, sub_indice, contrato_id, valor_bruto, valor_previsto, contratos(cliente_id, forma_pagamento, valor_total_contrato)')
            .eq('id', parcelaId)
            .single();

        if (fetchErr || !parcela) {
            return { ok: false, error: fetchErr?.message ?? 'Parcela não encontrada.' };
        }

        const contratoData = parcela.contratos as any;
        const clienteId: string | null = contratoData?.cliente_id ?? null;
        const contratoId: string | null = parcela.contrato_id ?? null;
        const formaAnterior: string = contratoData?.forma_pagamento ?? '';
        const ref = parcela.sub_indice
            ? `${parcela.numero_referencia}-${parcela.sub_indice}`
            : `${parcela.numero_referencia}`;

        const brlFmt = (v: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        // ── Step 2: Calculate real clearing date for THIS payment ─────────────────
        const disponivelEmReal = calcularDataDisponibilidade(dataPagamento, plataforma);

        // ── Step 3: Mark parcela as PAGO + fix its availability date ─────────────
        const updatePayload: any = {
            status_manual_override: 'PAGO',
            observacao: observacao || null,
            data_disponibilidade_prevista: disponivelEmReal,
            juros_aplicado: jurosAplicado || null,
        };

        if (novoValorBruto !== undefined) {
            updatePayload.valor_bruto = novoValorBruto;
        }

        const { error: updateError } = await supabaseAdmin
            .from('parcelas')
            .update(updatePayload)
            .eq('id', parcelaId);

        if (updateError) {
            console.error('[registrarPagamentoCompleto] Erro ao atualizar parcela:', updateError.message);
            return { ok: false, error: updateError.message };
        }

        // ── Step 3b: If juros was applied — propagate the difference to the contract total ──
        if (novoValorBruto !== undefined && contratoId) {
            const oldBruto = Number((parcela as any).valor_bruto ?? parcela.valor_previsto ?? 0);
            const diferenca = parseFloat((novoValorBruto - oldBruto).toFixed(2));
            if (diferenca > 0) {
                const currentTotal = Number(contratoData?.valor_total_contrato ?? NaN);
                if (!isNaN(currentTotal) && isFinite(currentTotal)) {
                    const novoTotal = parseFloat((currentTotal + diferenca).toFixed(2));
                    await supabaseAdmin
                        .from('contratos')
                        .update({ valor_total_contrato: novoTotal } as any)
                        .eq('id', contratoId);
                }
            }
        }

        const { error: insertError } = await supabaseAdmin
            .from('pagamentos')
            .insert({
                parcela_id: parcelaId,
                data_pagamento: dataPagamento,
                disponivel_em: disponivelEmReal,
                valor_pago: valorPago,
                taxa_gateway: taxaPlataforma,
                imposto_retido: impostoRetido || null,
                valor_liquido_real: valorLiquidoReal,
                plataforma: plataforma as any,
                status_pagamento: 'RECEBIDO' as any,
                anexo_url: anexoUrl || null,
            });

        if (insertError) {
            console.error('[registrarPagamentoCompleto] Erro ao inserir pagamento:', insertError.message);
            return {
                ok: false,
                error: `Parcela marcada como PAGO, mas falha ao gravar histórico: ${insertError.message}`,
            };
        }

        // ── Step 5: RIPPLE EFFECT — platform changed → update contract + open parcelas
        let rippleNote = '';
        if (contratoId && plataforma && plataforma !== formaAnterior) {
            // 5a) Update the contract's default payment method
            await supabaseAdmin
                .from('contratos')
                .update({ forma_pagamento: plataforma as any })
                .eq('id', contratoId);

            // 5b) Fetch all open (NORMAL) sibling parcelas
            const { data: openParcelas } = await supabaseAdmin
                .from('parcelas')
                .select('id, data_vencimento')
                .eq('contrato_id', contratoId)
                .eq('status_manual_override', 'NORMAL')
                .is('deleted_at', null);

            // 5c) Recalculate and cascade availability dates in parallel
            if (openParcelas && openParcelas.length > 0) {
                await Promise.all(
                    openParcelas.map((p) => {
                        const novaDisp = calcularDataDisponibilidade(p.data_vencimento, plataforma);
                        return supabaseAdmin
                            .from('parcelas')
                            .update({ data_disponibilidade_prevista: novaDisp })
                            .eq('id', p.id);
                    })
                );
            }

            rippleNote = ` | Alterou contrato de ${formaAnterior || '—'} para ${plataforma} e recalculou ${openParcelas?.length ?? 0} parcela(s) em aberto.`;
        }

        // ── Step 6: Audit log ─────────────────────────────────────────────────────
        const brlFmt2 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const logMsg = `Deu baixa na parcela ${ref} — Pago: ${brlFmt2(valorPago)} | Líq Real: ${brlFmt2(valorLiquidoReal)} | Taxa: ${brlFmt2(taxaPlataforma)} | Imposto: ${brlFmt2(impostoRetido)} | Juros: ${brlFmt2(jurosAplicado)} — via ${plataforma}${rippleNote}`;
        if (clienteId) {
            await registrarLog(clienteId, 'PARCELAS', logMsg);
        }

        revalidateAll(clienteId ?? undefined);
        return { ok: true };

    } catch (err: any) {
        console.error('[registrarPagamentoCompleto] Exceção:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
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
    try {
        await requireAuth();
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
    } catch (err: any) {
        console.error('[desmembrarParcela] Exceção:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
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
        await requireAuth();
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
            .select('valor_previsto, data_vencimento, numero_referencia, sub_indice, contrato_id, contratos(cliente_id, forma_pagamento)')
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

        // ── Recalculate clearing date based on new due date + payment method ──
        const formaPagamento: string = (old.contratos as any)?.forma_pagamento || 'PIX';
        const novaDisponibilidade = calcularDataDisponibilidade(novaDataVencimento, formaPagamento);

        // ── Apply update to parcela ───────────────────────────────────────────
        const { error: updateError } = await supabaseAdmin
            .from('parcelas')
            .update({
                valor_previsto: novoValor,
                data_vencimento: novaDataVencimento,
                data_disponibilidade_prevista: novaDisponibilidade,
            })
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

        // ── Audit log with JSON snapshots ─────────────────────────────────────
        // Declare clienteId BEFORE the if-block that uses it
        const clienteId = (old.contratos as any)?.cliente_id;

        if (clienteId) {
            const logMsg = changes.length > 0
                ? `Editou a parcela ${ref}: ${changes.join(' | ')}`
                : `Editou a parcela ${ref} (sem alterações no valor ou vencimento)`;
            await registrarLog(
                clienteId,
                'PARCELAS',
                logMsg,
                { numero_referencia: old.numero_referencia, valor_previsto: oldValor, data_vencimento: old.data_vencimento } as Record<string, unknown>,
                { numero_referencia: old.numero_referencia, valor_previsto: novoValor, data_vencimento: novaDataVencimento } as Record<string, unknown>
            );
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
    try {
        await requireAuth();
        // Guard: abort if already paid
        const { data: pag } = await supabaseAdmin
            .from('pagamentos')
            .select('id')
            .eq('parcela_id', id)
            .maybeSingle();

        if (pag) {
            return { ok: false, error: "Esta parcela já possui pagamento registrado e não pode ser excluída." };
        }

        // ── Fetch full context for math + logging ────────────────────────────────
        const { data: parcela, error: fetchError } = await supabaseAdmin
            .from('parcelas')
            .select('numero_referencia, sub_indice, valor_bruto, valor_previsto, contrato_id, contratos(cliente_id, valor_total_contrato)')
            .eq('id', id)
            .single();

        if (fetchError || !parcela) {
            return { ok: false, error: fetchError?.message ?? "Parcela não encontrada." };
        }

        const brlFmt = (v: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        const contratoData = parcela.contratos as any;
        const clienteId: string | null = contratoData?.cliente_id ?? null;
        // Use valor_bruto for contract total math (contract tracks gross revenue)
        const valorParcela: number = Number((parcela as any).valor_bruto ?? parcela.valor_previsto ?? 0);
        const valorAtualContrato: number = Number(contratoData?.valor_total_contrato ?? NaN);
        const ref = parcela.sub_indice
            ? `${parcela.numero_referencia}-${parcela.sub_indice}`
            : `${parcela.numero_referencia}`;

        // ── Soft delete the parcela ───────────────────────────────────────────────
        const { error } = await supabaseAdmin
            .from('parcelas')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) return { ok: false, error: error.message };

        // ── Deduct from contract total via central finance rule ───────────────────
        let novoValorContrato: number | null = null;
        if (!isNaN(valorAtualContrato) && isFinite(valorAtualContrato) && parcela.contrato_id) {
            novoValorContrato = calcularNovoValorContrato(valorAtualContrato, valorParcela, 'EXCLUIR');

            await supabaseAdmin
                .from('contratos')
                .update({ valor_total_contrato: novoValorContrato } as any)
                .eq('id', parcela.contrato_id);
        }

        // ── Detailed audit log ────────────────────────────────────────────────────
        if (clienteId) {
            const logMsg = novoValorContrato !== null
                ? `Excluiu a parcela ${ref} (${brlFmt(valorParcela)}). ` +
                `Valor total do contrato reduzido de ${brlFmt(valorAtualContrato)} para ${brlFmt(novoValorContrato)}.`
                : `Excluiu a parcela ${ref} (${brlFmt(valorParcela)}) logicamente.`;

            await registrarLog(clienteId, 'PARCELAS', logMsg);
        }

        revalidateAll(clienteId ?? undefined);
        return { ok: true };
    } catch (err: any) {
        console.error('[softDeleteParcela] Exceção:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// 5. RESTAURAR PARCELA (undo soft-delete — mirror of softDeleteParcela)
//    Adds valor_previsto back to contrato.valor_total_contrato.
// ─────────────────────────────────────────────────────────────────────────────
export async function restaurarParcela(id: string): Promise<ActionResult> {
    try {
        await requireAuth();
        // Fetch context: need valor_previsto, contrato_id, and current contract total
        const { data: parcela, error: fetchError } = await supabaseAdmin
            .from('parcelas')
            .select('numero_referencia, sub_indice, valor_bruto, valor_previsto, contrato_id, contratos(cliente_id, valor_total_contrato)')
            .eq('id', id)
            .single();

        if (fetchError || !parcela) {
            return { ok: false, error: fetchError?.message ?? 'Parcela não encontrada.' };
        }

        const brlFmt = (v: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        const contratoData = parcela.contratos as any;
        const clienteId: string | null = contratoData?.cliente_id ?? null;
        // Use valor_bruto for contract total math (contract tracks gross revenue)
        const valorParcela = Number((parcela as any).valor_bruto ?? parcela.valor_previsto ?? 0);
        const valorAtualContrato = Number(contratoData?.valor_total_contrato ?? NaN);
        const ref = parcela.sub_indice
            ? `${parcela.numero_referencia}-${parcela.sub_indice}`
            : `${parcela.numero_referencia}`;

        // ── Restore the parcela (clear deleted_at) ───────────────────────────
        const { error: restoreErr } = await supabaseAdmin
            .from('parcelas')
            .update({ deleted_at: null })
            .eq('id', id);

        if (restoreErr) return { ok: false, error: restoreErr.message };

        // ── Add valor_previsto back to contract total via central finance rule ───
        let novoValorContrato: number | null = null;
        if (!isNaN(valorAtualContrato) && isFinite(valorAtualContrato) && parcela.contrato_id) {
            novoValorContrato = calcularNovoValorContrato(valorAtualContrato, valorParcela, 'RESTAURAR');

            await supabaseAdmin
                .from('contratos')
                .update({ valor_total_contrato: novoValorContrato } as any)
                .eq('id', parcela.contrato_id);
        }

        // ── Detailed audit log ────────────────────────────────────────────────
        if (clienteId) {
            const logMsg = novoValorContrato !== null
                ? `Restaurou a parcela ${ref} (${brlFmt(valorParcela)}). ` +
                `Valor do contrato reajustado para ${brlFmt(novoValorContrato)}.`
                : `Restaurou a parcela ${ref} logicamente.`;

            await registrarLog(clienteId, 'PARCELAS', logMsg);
        }

        revalidateAll(clienteId ?? undefined);
        return { ok: true };

    } catch (err: any) {
        console.error('[restaurarParcela] Exceção:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. EDITAR STATUS DE PARCELA
//    Updates status_manual_override to any valid value (e.g. 'FINALIZAR PROJETO').
//    Used by NaoRenovarModal to register churn on a RENOVAR CONTRATO installment.
// ─────────────────────────────────────────────────────────────────────────────
export async function editarParcelaStatus(
    parcelaId: string,
    novoStatus: string
): Promise<ActionResult> {
    try {
        // Fetch context to build log message
        const { data: old, error: fetchErr } = await supabaseAdmin
            .from('parcelas')
            .select('numero_referencia, sub_indice, status_manual_override, contrato_id, contratos(cliente_id)')
            .eq('id', parcelaId)
            .single();

        if (fetchErr || !old) {
            return { ok: false, error: fetchErr?.message ?? 'Parcela não encontrada.' };
        }

        const { error: updateErr } = await supabaseAdmin
            .from('parcelas')
            .update({ status_manual_override: novoStatus as any })
            .eq('id', parcelaId);

        if (updateErr) {
            return { ok: false, error: updateErr.message };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clienteId: string | null = (old.contratos as any)?.cliente_id ?? null;
        const ref = old.sub_indice
            ? `${old.numero_referencia}-${old.sub_indice}`
            : `${old.numero_referencia}`;

        if (clienteId) {
            await registrarLog(
                clienteId,
                'PARCELAS',
                `Alterou status da parcela ${ref} de '${old.status_manual_override}' para '${novoStatus}'.`
            );
        }

        revalidateAll(clienteId ?? undefined);
        return { ok: true };

    } catch (err: any) {
        console.error('[editarParcelaStatus] Exceção:', err);
        return { ok: false, error: err.message || 'Erro desconhecido.' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. OBTER DETALHES COMPLETOS DA PARCELA
//    Detailed cross-table fetch for the "Ficha da Parcela" deep dive modal.
// ─────────────────────────────────────────────────────────────────────────────
export async function getParcelaDetails(parcelaId: string) {
    try {
        await requireAuth();
        const { data, error } = await supabaseAdmin
            .from('parcelas')
            .select(`
                *,
                pagamentos (*),
                contratos (
                    cliente_id, forma_pagamento, imposto_percentual, parcelas_total,
                    clientes (
                        nome_cliente, empresa_label, status_cliente, link_asana
                    ),
                    dim_agencias (
                        nome
                    )
                )
            `)
            .eq('id', parcelaId)
            .single();

        if (error || !data) {
            return { ok: false, error: error?.message ?? "Parcela não encontrada." };
        }

        return { ok: true, data };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
