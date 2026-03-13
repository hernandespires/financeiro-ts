'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
    LogOut, ShieldAlert, ChevronDown, ChevronRight,
    Table2, BarChart2, Users, UserPlus, LineChart,
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState, useRef } from 'react';

type UserProfile = {
    nome: string | null;
    email: string | null;
    avatar_url: string | null;
    cargo: string | null;
};

// ── Contas a Receber submenu items (Cadastrar is nested under Consultar) ──────
const CR_ITEMS_TOP = [
    { label: 'Mesa de Operações', href: '/contas-a-receber/lista', icon: Table2, soon: false },
    { label: 'Previsão', href: '/contas-a-receber/previsao', icon: BarChart2, soon: false },
];
const CR_ITEMS_BOTTOM = [
    { label: 'Métricas', href: null, icon: LineChart, soon: true },
];

function isCRActive(p: string) {
    return (
        p.startsWith('/contas-a-receber') ||
        p.startsWith('/consultar-clientes') ||
        p.startsWith('/cliente/') ||
        p === '/cadastro'
    );
}

export default function Header() {
    const pathname = usePathname();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [consultarExpanded, setConsultarExpanded] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load user profile
    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            supabase
                .from('usuarios')
                .select('nome, email, avatar_url, cargo')
                .eq('id', user.id)
                .single()
                .then(({ data }) => {
                    setProfile(data ?? {
                        nome: user.user_metadata?.full_name ?? null,
                        email: user.email ?? null,
                        avatar_url: user.user_metadata?.avatar_url ?? null,
                        cargo: null,
                    });
                });
        });
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Close dropdown on route change
    useEffect(() => { setDropdownOpen(false); }, [pathname]);

    async function handleLogout() {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await supabase.auth.signOut();
        router.push('/login');
    }

    if (pathname === '/login' || pathname === '/bloqueado') return null;

    const isAdmin = profile?.cargo === 'ADMIN' || profile?.cargo === 'DIRETOR';
    const initials = profile?.nome?.charAt(0).toUpperCase() ?? '?';
    const firstName = profile?.nome?.split(' ')[0] ?? 'Colaborador';
    const crActive = isCRActive(pathname);

    return (
        <header className="flex items-center justify-between bg-[#0A0A0A] border border-white/[0.08] rounded-2xl shadow-2xl px-5 py-3.5">

            {/* ── Logo → Dashboard ── */}
            <Link href="/" className="flex items-center gap-3 group shrink-0">
                <Image
                    src="/logo.png"
                    alt="TS"
                    width={32}
                    height={32}
                    className="object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                    priority
                />
                <div className="flex flex-col leading-none">
                    <span className="text-[9px] text-gray-600 uppercase tracking-[0.15em] font-medium">
                        Trajetória do Sucesso
                    </span>
                    <span className="text-sm font-bold text-white tracking-wide mt-0.5">
                        TS Financeiro
                    </span>
                </div>
            </Link>

            {/* ── Nav ── */}
            <nav className="flex items-center gap-1">

                {/* Contas a Receber dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen((v) => !v)}
                        className={[
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                            crActive
                                ? 'text-[#ffa300] bg-[#ffa300]/10 border border-[#ffa300]/15'
                                : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent',
                        ].join(' ')}
                    >
                        Contas a Receber
                        <ChevronDown
                            size={11}
                            strokeWidth={2.5}
                            className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {/* Dropdown panel */}
                    {dropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-[#111111] border border-white/[0.08] shadow-2xl py-1.5 z-50">
                            {/* Top items: Mesa + Previsão */}
                            {CR_ITEMS_TOP.map(({ label, href, icon: Icon }) => {
                                const isItemActive = pathname === href || pathname.startsWith(href + '/');
                                return (
                                    <Link
                                        key={label}
                                        href={href}
                                        className={[
                                            'flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium transition-colors',
                                            isItemActive ? 'text-[#ffa300] bg-[#ffa300]/5' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                                        ].join(' ')}
                                    >
                                        <Icon size={12} strokeWidth={isItemActive ? 2.5 : 2} />
                                        {label}
                                    </Link>
                                );
                            })}

                            {/* Consultar Clientes with nested expand */}
                            <div>
                                <div className="flex items-center">
                                    <Link
                                        href="/consultar-clientes"
                                        className={[
                                            'flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-medium transition-colors flex-1',
                                            (pathname.startsWith('/consultar-clientes') || pathname.startsWith('/cliente/'))
                                                ? 'text-[#ffa300] bg-[#ffa300]/5'
                                                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                                        ].join(' ')}
                                    >
                                        <Users size={12} strokeWidth={(pathname.startsWith('/consultar-clientes') || pathname.startsWith('/cliente/')) ? 2.5 : 2} />
                                        Consultar Clientes
                                    </Link>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setConsultarExpanded(v => !v); }}
                                        className="px-2 py-2 text-gray-600 hover:text-gray-300 transition-colors"
                                        title="Expandir"
                                    >
                                        <ChevronRight size={11} className={`transition-transform duration-200 ${consultarExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                </div>

                                {consultarExpanded && (
                                    <Link
                                        href="/cadastro"
                                        className={[
                                            'flex items-center gap-2 pl-9 pr-3.5 py-2 text-[11px] font-medium transition-colors',
                                            pathname === '/cadastro'
                                                ? 'text-[#ffa300] bg-[#ffa300]/5'
                                                : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                                        ].join(' ')}
                                    >
                                        <span className="text-gray-600 mr-0.5 text-xs">└</span>
                                        <UserPlus size={11} strokeWidth={pathname === '/cadastro' ? 2.5 : 2} />
                                        Cadastrar Cliente
                                    </Link>
                                )}
                            </div>

                            {/* Bottom items: Métricas (soon) */}
                            {CR_ITEMS_BOTTOM.map(({ label, icon: Icon }) => (
                                <div key={label} className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] text-gray-600 cursor-default">
                                    <Icon size={12} />
                                    {label}
                                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-gray-700 bg-white/5 px-1.5 py-0.5 rounded">
                                        Em breve
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </nav>

            {/* ── User actions ── */}
            <div className="flex items-center gap-2">
                <span className="hidden md:block text-[11px] text-gray-500 mr-1">
                    Olá, <span className="text-gray-300 font-medium">{firstName}</span>
                </span>

                {isAdmin && (
                    <Link
                        href="/admin"
                        className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors text-[10px] font-bold uppercase tracking-wider"
                    >
                        <ShieldAlert size={11} />
                        Admin
                    </Link>
                )}

                <Link
                    href="/configuracoes"
                    title="Configurações"
                    className="flex items-center justify-center"
                >
                    {profile?.avatar_url ? (
                        <img
                            src={profile.avatar_url}
                            alt={profile.nome ?? 'Avatar'}
                            className="w-7 h-7 rounded-full border border-white/10 object-cover hover:border-orange-500/40 transition-colors"
                        />
                    ) : (
                        <div className="w-7 h-7 rounded-full bg-orange-500/15 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-[11px] hover:bg-orange-500/25 transition-colors">
                            {initials}
                        </div>
                    )}
                </Link>

                <button
                    onClick={handleLogout}
                    title="Sair"
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-transparent border border-transparent text-gray-600 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all"
                >
                    <LogOut size={13} strokeWidth={2} />
                </button>
            </div>

        </header>
    );
}
