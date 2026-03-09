'use server'

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { editarValorContrato } from "@/actions/contratos";
import { requireAuth, requireAdmin } from "@/lib/authGuard";

export interface ActionResult {
    ok: boolean;
    error?: string;
}


function revalidateCliente(id: string) {
    revalidatePath(`/cliente/${id}`, 'page');
    revalidatePath('/consultar-clientes');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. SOFT-DELETE CLIENTE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function softDeleteCliente(id: string): Promise<ActionResult> {
    try {
        await requireAdmin();

        const { error } = await supabaseAdmin
            .from('clientes')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
        if (error) return { ok: false, error: error.message };

        await registrarLog(id, 'CLIENTES', 'Excluiu o cliente logicamente');
        revalidateCliente(id);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || "Erro desconhecido." };
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2. RESTAURAR CLIENTE (undo soft-delete)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function restaurarCliente(id: string): Promise<ActionResult> {
    try {
        await requireAdmin();

        const { error } = await supabaseAdmin
            .from('clientes')
            .update({ deleted_at: null })
            .eq('id', id);
        if (error) return { ok: false, error: error.message };

        await registrarLog(id, 'CLIENTES', 'Restaurou o cliente logicamente');
        revalidateCliente(id);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || "Erro desconhecido." };
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 3. EDITAR CLIENTE (with full JSON snapshots in audit log)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        agencia?: string | null;
        sdr?: string | null;
        closer?: string | null;
        cnpj_vinculado?: string | null;
        programa_fechado?: string | null;
    },
    contratoData?: {
        contratoId: string;
        novoValorContrato: number;
    }
): Promise<ActionResult> {
    try {
        await requireAuth();
        if (!data.nome_cliente?.trim()) return { ok: false, error: "Nome do cliente Ã© obrigatÃ³rio." };

        // â”€â”€ Fetch OLD state for diff + snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const { data: old, error: fetchErr } = await supabaseAdmin
            .from('clientes')
            .select('nome_cliente, empresa_label, cnpj_contrato, telefone, aniversario, pais, estado, cidade, segmento, link_asana')
            .eq('id', id)
            .single();
        if (fetchErr || !old) return { ok: false, error: fetchErr?.message ?? "Cliente nÃ£o encontrado." };

        // â”€â”€ Build human-readable field diff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const n = (v: string | null | undefined) => v?.trim() || null;
        const mudancas: string[] = [];
        const diffStr = (label: string, o: string | null | undefined, nw: string | null | undefined) => {
            if (n(o) !== n(nw)) mudancas.push(`${label}: '${n(o) ?? 'â€”'}' â†’ '${n(nw) ?? 'â€”'}'`);
        };
        diffStr('Nome', old.nome_cliente, data.nome_cliente);
        diffStr('Empresa', old.empresa_label, data.empresa_label);
        diffStr('CNPJ/EIN', old.cnpj_contrato, data.cnpj_contrato);
        diffStr('Telefone', old.telefone, data.telefone);
        diffStr('AniversÃ¡rio', old.aniversario, data.aniversario);
        diffStr('PaÃ­s', old.pais, data.pais);
        diffStr('Estado', old.estado, data.estado);
        diffStr('Cidade', old.cidade, data.cidade);
        diffStr('Segmento', old.segmento, data.segmento);
        diffStr('Link Asana', old.link_asana, data.link_asana);

        // â”€â”€ Update clientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Optional: update operational contrato fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (contratoData?.contratoId && (data.agencia !== undefined || data.sdr !== undefined || data.closer !== undefined || data.programa_fechado !== undefined)) {
            const agenciaRow = data.agencia
                ? (await supabaseAdmin.from('dim_agencias').select('id').eq('nome', data.agencia).maybeSingle()).data
                : null;
            const sdrRow = data.sdr
                ? (await supabaseAdmin.from('dim_equipe').select('id').eq('nome', data.sdr).maybeSingle()).data
                : null;
            const closerRow = data.closer
                ? (await supabaseAdmin.from('dim_equipe').select('id').eq('nome', data.closer).maybeSingle()).data
                : null;
            const programaRow = data.programa_fechado
                ? (await supabaseAdmin.from('dim_programas').select('id').eq('nome', data.programa_fechado).maybeSingle()).data
                : null;

            const ct: Record<string, any> = {};
            if (agenciaRow !== undefined) ct.agencia_id = agenciaRow?.id ?? null;
            if (sdrRow !== undefined) ct.sdr_id = sdrRow?.id ?? null;
            if (closerRow !== undefined) ct.closer_id = closerRow?.id ?? null;
            if (programaRow !== undefined) ct.programa_id = programaRow?.id ?? null;
            if (Object.keys(ct).length > 0)
                await supabaseAdmin.from('contratos').update(ct).eq('id', contratoData.contratoId);

            if (data.agencia !== undefined) mudancas.push(`AgÃªncia: '${data.agencia ?? 'â€”'}'`);
            if (data.sdr !== undefined) mudancas.push(`SDR: '${data.sdr ?? 'â€”'}'`);
            if (data.closer !== undefined) mudancas.push(`Closer: '${data.closer ?? 'â€”'}'`);
            if (data.programa_fechado !== undefined) mudancas.push(`Programa: '${data.programa_fechado ?? 'â€”'}'`);
        }

        // â”€â”€ Audit log with full JSON snapshots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const logMsg = mudancas.length > 0
            ? `Editou cliente: ${mudancas.join(' | ')}`
            : 'Editou cliente (sem mudanÃ§as detectadas)';

        await registrarLog(
            id,
            'CLIENTES',
            logMsg,
            old as Record<string, unknown>,     // dadosAnteriores
            data as Record<string, unknown>      // dadosNovos
        );

        // â”€â”€ Optional: financial recalculation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (contratoData) {
            const { contratoId, novoValorContrato } = contratoData;
            const { data: ct } = await supabaseAdmin
                .from('contratos').select('valor_total_contrato').eq('id', contratoId).single();
            const currentTotal = Number((ct as any)?.valor_total_contrato ?? NaN);
            if (!isNaN(currentTotal) && Math.abs(novoValorContrato - currentTotal) > 0.01) {
                const result = await editarValorContrato(contratoId, novoValorContrato);
                if (!result.ok) return { ok: false, error: `Dados salvos, mas falha no recÃ¡lculo: ${result.error}` };
            }
        }

        revalidateCliente(id);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || "Erro desconhecido." };
    }
}
