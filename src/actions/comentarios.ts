'use server'

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth } from "@/lib/authGuard";

export async function adicionarComentario(clienteId: string, comentario: string) {
    try {
        if (!comentario.trim()) return { error: "Comentário vazio" };

        const user = await requireAuth();

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
