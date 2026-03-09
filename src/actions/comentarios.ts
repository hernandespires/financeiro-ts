'use server'

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

export async function adicionarComentario(clienteId: string, comentario: string) {
    try {
        if (!comentario.trim()) return { error: "Comentário vazio" };

        // Get the authenticated user from the session cookie (same pattern as logger.ts)
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Sessão expirada. Faça login novamente." };

        const { error } = await supabaseAdmin.from('comentarios_clientes').insert({
            cliente_id: clienteId,
            usuario_id: user.id,
            comentario: comentario.trim(),
        });

        if (error) {
            console.error("[SERVER] Erro ao inserir comentário no Supabase:", error);
            return { error: error.message };
        }

        revalidatePath(`/cliente/${clienteId}`, "page");
        return { ok: true };
    } catch (err: any) {
        console.error("[SERVER] Exceção inesperada:", err);
        return { error: err.message || "Erro desconhecido." };
    }
}
