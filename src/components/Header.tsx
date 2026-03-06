'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut, ShieldAlert } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState } from 'react';

type UserProfile = {
    nome: string | null;
    email: string | null;
    avatar_url: string | null;
    cargo: string | null;
};

export default function Header() {
    const pathname = usePathname();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            // Fetch cargo + display info from usuarios table
            supabase
                .from('usuarios')
                .select('nome, email, avatar_url, cargo')
                .eq('id', user.id)
                .single()
                .then(({ data }) => {
                    if (data) {
                        setProfile(data);
                    } else {
                        // Fallback to auth metadata if no row yet
                        setProfile({
                            nome: user.user_metadata?.full_name ?? null,
                            email: user.email ?? null,
                            avatar_url: user.user_metadata?.avatar_url ?? null,
                            cargo: null,
                        });
                    }
                });
        });
    }, []);

    async function handleLogout() {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await supabase.auth.signOut();
        router.push('/login');
    }

    if (pathname === '/login') return null;

    const isAdmin = profile?.cargo === 'ADMIN' || profile?.cargo === 'DIRETOR';
    const initials = profile?.nome?.charAt(0).toUpperCase() ?? '?';

    return (
        <header className="flex items-center justify-between bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl rounded-2xl px-6 py-4">

            {/* ── LEFT: Logo + Identity ── */}
            <Link href="/" className="flex items-center gap-4 cursor-pointer group">
                <Image
                    src="/logo.png"
                    alt="TS Logo"
                    width={48}
                    height={48}
                    className="object-contain group-hover:opacity-80 transition-opacity"
                    priority
                />
                <div className="flex flex-col leading-tight">
                    <span className="text-sm text-gray-300">
                        Bem vindo,{' '}
                        <span className="text-orange-500 font-semibold">
                            {profile?.nome?.split(' ')[0] ?? 'Colaborador'}
                        </span>
                    </span>
                    <span className="text-lg font-bold tracking-widest text-white uppercase group-hover:text-orange-500 transition-colors">
                        Financeiro
                    </span>
                </div>
            </Link>

            {/* ── RIGHT: Actions ── */}
            <div className="flex items-center gap-3">

                {/* Admin Panel link (only for ADMIN / DIRETOR) */}
                {isAdmin && (
                    <Link
                        href="/admin"
                        title="Painel Administrativo"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                        <ShieldAlert size={14} />
                        Admin
                    </Link>
                )}

                {/* Notification Bell */}
                <button
                    aria-label="Notificações"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white transition-colors"
                >
                    <Bell size={18} strokeWidth={2} />
                </button>

                {/* Avatar → links to /configuracoes */}
                <Link
                    href="/configuracoes"
                    title="Configurações & Perfil"
                    className="flex items-center gap-2 hover:scale-105 transition-transform"
                >
                    {profile?.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt={profile.nome ?? 'Avatar'}
                            className="w-9 h-9 rounded-full border border-white/15 object-cover hover:border-orange-500/50 transition-colors"
                        />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 font-bold text-sm hover:bg-orange-500/30 transition-colors">
                            {initials}
                        </div>
                    )}
                </Link>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    title="Sair"
                    aria-label="Sair"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                >
                    <LogOut size={16} strokeWidth={2} />
                </button>

            </div>
        </header>
    );
}
