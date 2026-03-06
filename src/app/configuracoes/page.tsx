import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ShieldAlert, User, Bell, Palette, Lock, ChevronRight } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";

export default async function ConfiguracoesPage() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll() } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: dbUser } = await supabaseAdmin
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .single();

    const isAdmin = dbUser?.cargo === 'ADMIN' || dbUser?.cargo === 'DIRETOR';

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto pb-10 w-full">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Configurações</span>
            </nav>

            {/* Profile Header Card */}
            <div className="rounded-3xl bg-white/[0.02] backdrop-blur-xl border border-white/10 shadow-2xl p-8 flex flex-col md:flex-row items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-orange-500/20 border-2 border-orange-500/50 flex items-center justify-center text-orange-500 font-black text-4xl overflow-hidden shadow-[0_0_30px_rgba(249,115,22,0.2)]">
                    {dbUser?.avatar_url ? (
                        <img src={dbUser.avatar_url} alt="Perfil" className="w-full h-full object-cover" />
                    ) : (
                        dbUser?.nome?.charAt(0).toUpperCase() || 'U'
                    )}
                </div>
                <div className="flex flex-col text-center md:text-left">
                    <h1 className="text-3xl font-black text-white tracking-tight">{dbUser?.nome || 'Colaborador'}</h1>
                    <p className="text-gray-400">{dbUser?.email}</p>
                    <div className="mt-3 flex items-center justify-center md:justify-start gap-2">
                        <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border ${isAdmin
                                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                : 'bg-white/5 border-white/10 text-gray-300'
                            }`}>
                            {dbUser?.cargo || 'FINANCEIRO'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* ── Sidebar Menu ── */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3 text-white">
                            <User size={18} className="text-gray-400" />
                            <span className="text-sm font-semibold">Meus Dados</span>
                        </div>
                        <ChevronRight size={16} className="text-gray-500" />
                    </div>
                    {[
                        { icon: <Bell size={18} className="text-gray-400" />, label: 'Notificações' },
                        { icon: <Palette size={18} className="text-gray-400" />, label: 'Aparência' },
                        { icon: <Lock size={18} className="text-gray-400" />, label: 'Segurança' },
                    ].map(({ icon, label }) => (
                        <div key={label} className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 cursor-not-allowed opacity-50">
                            <div className="flex items-center gap-3 text-white">{icon} <span className="text-sm font-semibold">{label}</span></div>
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Em breve</span>
                        </div>
                    ))}
                </div>

                {/* ── Content Area ── */}
                <div className="md:col-span-2 flex flex-col gap-6">

                    {/* Admin zone — only for ADMIN / DIRETOR */}
                    {isAdmin && (
                        <div className="rounded-2xl bg-orange-500/5 border border-orange-500/20 p-6 flex flex-col gap-4 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-3xl rounded-full pointer-events-none" />
                            <div className="flex items-center gap-2 text-orange-500">
                                <ShieldAlert size={20} />
                                <span className="text-xs font-bold uppercase tracking-widest">Acesso Privilegiado</span>
                            </div>
                            <h2 className="text-xl font-black text-white">Painel Administrativo</h2>
                            <p className="text-sm text-gray-400 mb-2">
                                Como administrador, você tem acesso ao controle de usuários, permissões de sistema e logs de auditoria de toda a equipe.
                            </p>
                            <Link
                                href="/admin"
                                className="w-fit bg-orange-500 hover:bg-orange-400 text-black font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)]"
                            >
                                Acessar Gerenciamento de Equipe
                            </Link>
                        </div>
                    )}

                    {/* Workspace info */}
                    <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/5 p-6 flex flex-col gap-4">
                        <h2 className="text-lg font-bold text-white">Integração Workspace</h2>
                        <p className="text-sm text-gray-400">
                            Sua conta está vinculada através do Google Workspace (SSO). A atualização de foto de perfil e senha devem ser feitas diretamente no painel do Google.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
