import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase';
import { ShieldAlert } from 'lucide-react';
import LogoutButton from './LogoutButton';

export default async function BloqueadoPage() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    // ── Auto-register so the Admin can see and assign them a role ─────────────
    const { data: existingUser } = await supabaseAdmin
        .from('usuarios')
        .select('id, cargo')
        .eq('id', user.id)
        .maybeSingle();

    if (!existingUser) {
        // First visit: insert row with cargo = null so they appear in the admin panel
        await supabaseAdmin.from('usuarios').insert({
            id: user.id,
            email: user.email,
            nome: user.user_metadata?.full_name || user.email,
            avatar_url: user.user_metadata?.avatar_url || null,
            cargo: null,
        });
    } else if (existingUser.cargo) {
        // Race condition guard: admin may have assigned a role between middleware and here
        redirect('/');
    }

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[9999] overflow-hidden font-sans">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-[450px] flex flex-col items-center z-10 text-center animate-in fade-in zoom-in duration-500">
                {/* Icon */}
                <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-500 mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                    <ShieldAlert size={36} strokeWidth={2} />
                </div>

                {/* Heading */}
                <h1 className="text-3xl font-black text-white tracking-tight mb-3">
                    Acesso Restrito
                </h1>

                {/* Body */}
                <p className="text-sm text-gray-400 mb-8 leading-relaxed">
                    Sua conta foi autenticada com sucesso, mas você ainda{' '}
                    <strong className="text-white">não possui um cargo atribuído</strong> no sistema.
                    <br /><br />
                    Por questões de segurança, as informações financeiras estão ocultas. Por favor,
                    solicite a um Administrador que libere o seu acesso.
                </p>

                <LogoutButton />
            </div>
        </div>
    );
}
