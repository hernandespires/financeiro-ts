import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ShieldAlert, Users, Key, Shield } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import UserRoleSelector from "@/components/UserRoleSelector";

export default async function AdminPage() {
    // ── Server-side role guard ───────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll() } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: currentUser } = await supabaseAdmin
        .from('usuarios').select('cargo').eq('id', user.id).single();
    if (currentUser?.cargo !== 'ADMIN' && currentUser?.cargo !== 'DIRETOR') {
        redirect('/');
    }

    // ── Fetch all users ───────────────────────────────────────
    const { data: usuariosData } = await supabaseAdmin
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false });

    const usuarios = usuariosData || [];
    const totalAdmins = usuarios.filter((u: any) => u.cargo === 'ADMIN' || u.cargo === 'DIRETOR').length;

    return (
        <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-10">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Painel Administrativo</span>
            </nav>

            {/* Hero Card */}
            <div className="rounded-3xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-orange-500 mb-1">
                        <ShieldAlert size={20} />
                        <span className="text-xs font-bold uppercase tracking-widest">Segurança & Acessos</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Gerenciamento de Equipe</h1>
                    <p className="text-sm text-gray-400">Controle o nível de acesso e as permissões de cada colaborador do ERP.</p>
                </div>

                <div className="flex gap-4">
                    <div className="flex flex-col bg-black/40 border border-white/10 rounded-2xl px-6 py-4">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            <Users size={12} /> Total Registrado
                        </span>
                        <span className="text-2xl font-black text-white mt-1">{usuarios.length}</span>
                    </div>
                    <div className="flex flex-col bg-orange-500/10 border border-orange-500/20 rounded-2xl px-6 py-4">
                        <span className="text-[10px] text-orange-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            <Key size={12} /> Acesso Total
                        </span>
                        <span className="text-2xl font-black text-orange-500 mt-1">{totalAdmins}</span>
                    </div>
                </div>
            </div>

            {/* Users List */}
            <div className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Shield size={18} className="text-orange-500" />
                    Usuários do Sistema
                </h2>

                <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 bg-black/20">
                                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Colaborador</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">E-mail Corporativo</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Data de Entrada</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-orange-500 uppercase tracking-widest text-right">Cargo / Permissão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {usuarios.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-14 text-center text-sm text-gray-600">
                                        <span className="text-3xl block mb-2">👥</span>
                                        Nenhum usuário registrado ainda.
                                    </td>
                                </tr>
                            ) : (
                                usuarios.map((user: any) => (
                                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {user.avatar_url ? (
                                                    <img
                                                        src={user.avatar_url}
                                                        alt="Avatar"
                                                        className="w-8 h-8 rounded-full border border-white/10"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 font-bold text-xs">
                                                        {user.nome ? user.nome.charAt(0).toUpperCase() : '?'}
                                                    </div>
                                                )}
                                                <span className="text-sm font-bold text-white">{user.nome || 'Usuário Pendente'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-400">{user.email}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500">
                                            {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <UserRoleSelector userId={user.id} currentRole={user.cargo || 'FINANCEIRO'} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
