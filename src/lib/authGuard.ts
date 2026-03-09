import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Validates the caller's session. Throws if not authenticated.
 * Use in any Server Action that requires a logged-in user.
 */
export async function requireAuth() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Ação não autorizada. Sessão inválida ou expirada.");
    return user;
}

/**
 * Validates the caller's session AND checks for ADMIN / DIRETOR role.
 * Throws if not authenticated or if role is insufficient.
 */
export async function requireAdmin() {
    const user = await requireAuth();
    const { data: dbUser } = await supabaseAdmin
        .from('usuarios')
        .select('cargo')
        .eq('id', user.id)
        .single();
    if (dbUser?.cargo !== 'ADMIN' && dbUser?.cargo !== 'DIRETOR') {
        throw new Error("Permissão negada. Acesso restrito a administradores.");
    }
    return user;
}
