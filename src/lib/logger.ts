import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Centralized audit logger.
 *
 * @param registroId    - UUID of the affected record (cliente, contrato, parcela…)
 * @param tabela        - Affected table name for the UI label (e.g. 'CLIENTES', 'PARCELAS')
 * @param acao          - Human-readable description of the action
 * @param dadosAnteriores - Optional JSONB snapshot of the record BEFORE the change
 * @param dadosNovos      - Optional JSONB snapshot of the record AFTER the change
 */
export async function registrarLog(
    registroId: string,
    tabela: string,
    acao: string,
    dadosAnteriores?: Record<string, unknown> | null,
    dadosNovos?: Record<string, unknown> | null
) {
    try {
        const cookieStore = await cookies()

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll() { return cookieStore.getAll() } } }
        )

        const { data: { user } } = await supabase.auth.getUser()

        let nomeUsuario = 'Sistema Automático'
        if (user) {
            const { data: dbUser } = await supabaseAdmin
                .from('usuarios')
                .select('nome')
                .eq('id', user.id)
                .single()
            nomeUsuario = dbUser?.nome || user.email || 'Sistema Automático'
        }

        await supabaseAdmin.from('atividades_log').insert({
            registro_id: registroId,
            tabela_afetada: tabela,
            acao,
            usuario_email: nomeUsuario,
            // JSONB columns — pass null when no snapshot provided
            dados_anteriores: dadosAnteriores ?? null,
            dados_novos: dadosNovos ?? null,
        })

    } catch (error) {
        console.error('[LOGGER] Erro ao registrar log:', error)
    }
}
