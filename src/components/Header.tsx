import Image from 'next/image';
import { Bell, ChevronDown, UserCircle } from 'lucide-react';

export default function Header() {
    return (
        <header className="flex items-center justify-between bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4">

            {/* ── LEFT: Logo + Identity ── */}
            <div className="flex items-center gap-4">
                <Image
                    src="/logo.png"
                    alt="TS Logo"
                    width={48}
                    height={48}
                    className="object-contain"
                    priority
                />
                <div className="flex flex-col leading-tight">
                    <span className="text-sm text-gray-300">
                        Bem vindo,{' '}
                        <span className="text-orange-500 font-semibold">Colaborador</span>
                    </span>
                    <span className="text-lg font-bold tracking-widest text-white uppercase">
                        Financeiro
                    </span>
                </div>
            </div>

            {/* ── RIGHT: Actions ── */}
            <div className="flex items-center gap-3">

                {/* Notification Bell */}
                <button
                    aria-label="Notificações"
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white transition-colors"
                >
                    <Bell size={18} strokeWidth={2} />
                </button>

                {/* Profile */}
                <button
                    aria-label="Perfil"
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-orange-500 text-orange-500 hover:bg-orange-500/10 active:bg-orange-500/20 text-sm font-medium transition-colors"
                >
                    <UserCircle size={18} strokeWidth={1.8} />
                    <span>Perfil</span>
                    <ChevronDown size={14} strokeWidth={2} />
                </button>

            </div>
        </header>
    );
}
