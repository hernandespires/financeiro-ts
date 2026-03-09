'use server'

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { editarValorContrato } from "@/actions/contratos";

export interface ActionResult {
    ok: boolean;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SOFT DELETE CLIENTE
// ─────────────────────────────────────────────────────────────────────────────
export async function softDeleteCliente(id: string): Promise<ActionResult> {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll() { return cookieStore.getAll(); } } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: "Sessão expirada." };

        const { data: dbUser } = await supabaseAdmin
            .from('usuarios').select('cargo').eq('id', user.id).single();
        if (dbUser?.cargo !== 'ADMIN' && dbUser?.cargo !== 'DIRETOR')
            return { ok: false, error: "Sem permissão para excluir clientes." };

        const { error } = await supabaseAdmin
            .from('clientes')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
        if (error) return { ok: false, error: error.message };

        await registrarLog(id, 'CLIENTES', 'Excluiu o cliente logicamente');
        revalidatePath('/consultar-clientes');
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || "Erro desconhecido." };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EDITAR CLIENTE
//    • Updates clientes table (all editable fields incl. location & asana link)
//    • Optionally updates the active contrato (agencia, sdr, closer, cnpj_vinculado)
//    • Optionally recalculates installment values via editarValorContrato
//    • Produces a comprehensive field-level diff audit log
// ─────────────────────────────────────────────────────────────────────────────
export async function editarCliente(
    id: string,
    data: {
        nome_cliente: string;
        empresa_label: string | null;
        cnpj_contrato: string | null;
        telefone: string | null;
        aniversario?: string | null;
        pais?: string | null;
        estado?: string | null;
        cidade?: string | null;
        segmento: string | null;
        link_asana?: string | null;
        // Contrato operational fields (optional)
        agencia?: string | null;
        sdr?: string | null;
        closer?: string | null;
        cnpj_vinculado?: string | null;
    },
    contratoData?: {
        contratoId: string;
        novoValorContrato: number;
    }
): Promise<ActionResult> {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll() { return cookieStore.getAll(); } } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

        if (!data.nome_cliente?.trim())
            return { ok: false, error: "Nome do cliente é obrigatório." };

        // ── Fetch OLD client data ─────────────────────────────────────────────
        const { data: old, error: fetchErr } = await supabaseAdmin
            .from('clientes')
            .select('nome_cliente, empresa_label, cnpj_contrato, telefone, aniversario, pais, estado, cidade, segmento, link_asana')
            .eq('id', id)
            .single();
        if (fetchErr || !old)
            return { ok: false, error: fetchErr?.message ?? "Cliente não encontrado." };

        // ── Build field-level diff ────────────────────────────────────────────
        const n = (v: string | null | undefined) => v?.trim() || null;
        const mudancas: string[] = [];

        function diff(label: string, oldV: string | null | undefined, newV: string | null | undefined) {
            const o = n(oldV); const nw = n(newV);
            if (o !== nw) mudancas.push(`${label}: '${o ?? '—'}' → '${nw ?? '—'}'`);
        }

        diff('Nome', old.nome_cliente, data.nome_cliente);
        diff('Empresa', old.empresa_label, data.empresa_label);
        diff('CNPJ/EIN', old.cnpj_contrato, data.cnpj_contrato);
        diff('Telefone', old.telefone, data.telefone);
        diff('Aniversário', old.aniversario, data.aniversario);
        diff('País', old.pais, data.pais);
        diff('Estado', old.estado, data.estado);
        diff('Cidade', old.cidade, data.cidade);
        diff('Segmento', old.segmento, data.segmento);
        diff('Link Asana', old.link_asana, data.link_asana);

        // ── Update clientes table ─────────────────────────────────────────────
        const { error: updateErr } = await supabaseAdmin
            .from('clientes')
            .update({
                nome_cliente: data.nome_cliente.trim(),
                empresa_label: n(data.empresa_label),
                cnpj_contrato: n(data.cnpj_contrato),
                telefone: n(data.telefone),
                aniversario: n(data.aniversario) ?? null,
                pais: n(data.pais),
                estado: n(data.estado),
                cidade: n(data.cidade),
                segmento: n(data.segmento),
                link_asana: n(data.link_asana),
            })
            .eq('id', id);
        if (updateErr) return { ok: false, error: updateErr.message };

        // ── Optional: update contrato operational fields ───────────────────────
        if (contratoData?.contratoId && (data.agencia !== undefined || data.sdr !== undefined || data.closer !== undefined || data.cnpj_vinculado !== undefined)) {
            // Fetch old contrato values for diff
            const { data: oldCt } = await supabaseAdmin
                .from('contratos')
                .select('agencia_id, sdr_id, closer_id')
                .eq('id', contratoData.contratoId)
                .single();

            // Resolve dim_agencias / dim_equipe IDs from names
            const agenciaRow = data.agencia
                ? (await supabaseAdmin.from('dim_agencias').select('id').eq('nome', data.agencia).maybeSingle()).data
                : null;
            const sdrRow = data.sdr
                ? (await supabaseAdmin.from('dim_equipe').select('id').eq('nome', data.sdr).maybeSingle()).data
                : null;
            const closerRow = data.closer
                ? (await supabaseAdmin.from('dim_equipe').select('id').eq('nome', data.closer).maybeSingle()).data
                : null;

            const contratoUpdate: Record<string, any> = {};
            if (agenciaRow !== undefined) contratoUpdate.agencia_id = agenciaRow?.id ?? null;
            if (sdrRow !== undefined) contratoUpdate.sdr_id = sdrRow?.id ?? null;
            if (closerRow !== undefined) contratoUpdate.closer_id = closerRow?.id ?? null;

            if (Object.keys(contratoUpdate).length > 0) {
                await supabaseAdmin.from('contratos').update(contratoUpdate).eq('id', contratoData.contratoId);
            }

            // Add operational changes to diff (use display names, not UUIDs)
            if (data.agencia !== undefined) mudancas.push(`Agência: '${data.agencia ?? '—'}'`);
            if (data.sdr !== undefined) mudancas.push(`SDR: '${data.sdr ?? '—'}'`);
            if (data.closer !== undefined) mudancas.push(`Closer: '${data.closer ?? '—'}'`);
        }

        // ── Build final log message ────────────────────────────────────────────
        const logMsg = mudancas.length > 0
            ? `Editou cliente: ${mudancas.join(' | ')}`
            : 'Editou cliente (sem mudanças detectadas)';

        await registrarLog(id, 'CLIENTES', logMsg);

        // ── Optional: financial recalculation ────────────────────────────────
        if (contratoData) {
            const { contratoId, novoValorContrato } = contratoData;
            const { data: ct } = await supabaseAdmin
                .from('contratos')
                .select('valor_total_contrato')
                .eq('id', contratoId)
                .single();

            const currentTotal = parseFloat(String((ct as any)?.valor_total_contrato ?? NaN));
            if (!isNaN(currentTotal) && Math.abs(novoValorContrato - currentTotal) > 0.01) {
                const contratoResult = await editarValorContrato(contratoId, novoValorContrato);
                if (!contratoResult.ok) {
                    return {
                        ok: false,
                        error: `Dados salvos, mas falha no recálculo financeiro: ${contratoResult.error}`,
                    };
                }
            }
        }

        revalidatePath(`/cliente/${id}`, 'page');
        revalidatePath('/consultar-clientes');
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || "Erro desconhecido." };
    }
}
