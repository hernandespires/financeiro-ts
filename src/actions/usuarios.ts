'use server'

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/authGuard";

export async function atualizarCargoUsuario(userId: string, novoCargo: string) {
    try {
        await requireAdmin();

        const { error } = await supabaseAdmin
            .from('usuarios')
            .update({ cargo: novoCargo })
            .eq('id', userId);

        if (error) {
            console.error("[SERVER] Erro ao atualizar cargo:", error);
            return { error: error.message };
        }

        revalidatePath('/admin', 'page');
        return { ok: true };
    } catch (err: any) {
        return { error: err.message || "Erro desconhecido." };
    }
}
