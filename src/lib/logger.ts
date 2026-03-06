import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function registrarLog(registroId: string, tabela: string, acao: string) {
    try {
        const cookieStore = await cookies()

        // SSR client to read the authenticated session from cookies
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                },
            }
        )

        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email || 'Sistema Automático'

        // Admin client bypasses RLS on insert
        await supabaseAdmin.from('atividades_log').insert({
            registro_id: registroId,
            tabela_afetada: tabela,
            acao: acao,
            usuario_email: email,
        })

    } catch (error) {
        console.error('[LOGGER] Erro ao registrar log:', error)
    }
}
