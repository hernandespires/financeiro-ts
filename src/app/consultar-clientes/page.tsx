import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Plus, ChevronRight, SlidersHorizontal, X, CheckCircle2, Clock, AlertCircle, ShieldAlert } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import ClientSearchInput from "@/components/ClientSearchInput";
import { getRiskStatus } from "@/lib/financeRules";
import { brl, toDateStr, daysLate, fmtDate } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
type ClientStatus = "EM DIA" | "ATRASO" | "INADIMPLENTE" | "PERDA" | "CONCLUÍDO" | "QUEBRA";

interface ProcessedClient {
    id: string;
    nomeCliente: string;
    empresaLabel: string | null;
    valorTotalAtivo: number;
    proximoVencimento: string | null;
    status: ClientStatus;
    tipoContrato: string | null;
    deletedAt: string | null;
}

// ─── Status badge style map ───────────────────────────────────────────────────
const statusStyle: Record<ClientStatus, string> = {
    "EM DIA": "bg-green-500/10 text-green-400 border border-green-500/20",
    "ATRASO": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    "INADIMPLENTE": "bg-red-500/10 text-red-400 border border-red-500/20",
    "PERDA": "bg-red-900/20 text-red-600 border border-red-700/30",
    "CONCLUÍDO": "bg-gray-500/10 text-gray-400 border border-gray-500/20",
    "QUEBRA": "bg-red-900/30 text-red-400 border border-red-700/40",
};

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function ConsultarClientesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; q?: string }>;
}) {
    // Next.js 15: searchParams is async
    const params = await searchParams;
    const currentFilter = (params?.status ?? "TODOS").toLowerCase();
    const currentQ = (params?.q ?? "").toLowerCase().trim();
    const todayStr = toDateStr(new Date());

    // ── Auth + role ───────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseSSR = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); } } }
    );
    const { data: { user } } = await supabaseSSR.auth.getUser();
    if (!user) redirect('/login');

    const { data: currentUser } = await supabaseAdmin
        .from('usuarios').select('cargo').eq('id', user.id).single();
    const isAdmin = currentUser?.cargo === 'ADMIN' || currentUser?.cargo === 'DIRETOR';

    // ── Fetch ─────────────────────────────────────────────────────────────────
    let query = supabaseAdmin
        .from("clientes")
        .select(
            "id, nome_cliente, empresa_label, status_cliente, deleted_at, contratos(id, tipo_contrato, valor_total_contrato, parcelas(data_vencimento, status_manual_override, valor_previsto))"
        )
        .order("nome_cliente", { ascending: true });

    // Non-admins only see active (non-deleted) clients
    if (!isAdmin) {
        query = query.is('deleted_at', null);
    }

    const { data: clientsData, error } = await query;

    if (error) {
        console.error("[ConsultarClientes] Supabase error:", error.message);
    }

    // ── Process clients ───────────────────────────────────────────────────────
    type RawCliente = NonNullable<typeof clientsData>[number];

    const allClients: ProcessedClient[] = (clientsData ?? []).map(
        (c: RawCliente) => {
            const statusCliente = (c as any).status_cliente as string | null;

        const contratos = (c.contratos as {
                id: string;
                tipo_contrato: string | null;
                valor_total_contrato: number;
                parcelas: {
                    data_vencimento: string;
                    status_manual_override: string;
                    valor_previsto: number;
                }[];
            }[]) ?? [];

            // If client has a manual terminal status, use it directly
            let status: ClientStatus = "CONCLUÍDO";
            if (statusCliente === "QUEBRA DE CONTRATO") {
                status = "QUEBRA";
            } else {
                // Flat list of open parcels across ALL contracts (all non-terminal statuses)
                const OPEN_STATUSES = new Set([
                    "NORMAL", "ATRASADO", "INADIMPLENTE", "PERDA DE FATURAMENTO",
                    "POSSUI INADIMPLENCIA", "POSSUI PERDA",
                ]);
                const openParcelas = contratos.flatMap((ct) =>
                    (ct.parcelas ?? []).filter((p) => OPEN_STATUSES.has(p.status_manual_override))
                );

                // Cross-default: worst delay across all open parcels
                if (openParcelas.length > 0) {
                    const maxLate = Math.max(
                        ...openParcelas.map((p) => daysLate(p.data_vencimento, todayStr))
                    );
                    status = getRiskStatus(maxLate) as ClientStatus;
                }

                // nextVencimento uses same open parcelas
                const sortedDates = openParcelas.map((p) => p.data_vencimento).sort();
                const futureDates = sortedDates.filter((d) => d >= todayStr);
                const proximoVencimento =
                    futureDates[0] ?? sortedDates[sortedDates.length - 1] ?? null;

                // Sum total active contract value
                const valorTotalAtivo = contratos.reduce(
                    (s, ct) => s + (ct.valor_total_contrato ?? 0), 0
                );
                const tipoContrato = contratos[0]?.tipo_contrato ?? null;

                return {
                    id: c.id as string,
                    nomeCliente: (c.nome_cliente as string) ?? "—",
                    empresaLabel: c.empresa_label as string | null,
                    valorTotalAtivo,
                    proximoVencimento,
                    status,
                    tipoContrato,
                    deletedAt: (c as any).deleted_at as string | null,
                };
            }

            // QUEBRA DE CONTRATO path — no open parcelas, just show totals
            const valorTotalAtivo = contratos.reduce((s, ct) => s + (ct.valor_total_contrato ?? 0), 0);
            const tipoContrato = contratos[0]?.tipo_contrato ?? null;
            return {
                id: c.id as string,
                nomeCliente: (c.nome_cliente as string) ?? "—",
                empresaLabel: c.empresa_label as string | null,
                valorTotalAtivo,
                proximoVencimento: null,
                status,
                tipoContrato,
                deletedAt: (c as any).deleted_at as string | null,
            };
        }
    );

    // ── KPI counts ────────────────────────────────────────────────────────────
    const countEmDia = allClients.filter((c) => c.status === "EM DIA").length;
    const countAtraso = allClients.filter((c) => c.status === "ATRASO").length;
    const countInadimplente = allClients.filter((c) => c.status === "INADIMPLENTE").length;
    const countPerda = allClients.filter((c) => c.status === "PERDA").length;

    // ── Filtered list ─────────────────────────────────────────────────────────
    // Step 1: status filter
    const statusFiltered =
        currentFilter === "todos"
            ? allClients
            : allClients.filter(
                (c) => c.status.toLowerCase() === currentFilter
            );

    // Step 2: text search filter
    const filteredClients = currentQ
        ? statusFiltered.filter(
            (c) =>
                c.nomeCliente.toLowerCase().includes(currentQ) ||
                (c.empresaLabel ?? "").toLowerCase().includes(currentQ)
        )
        : statusFiltered;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-10">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-[10px]">
                <Link href="/" className="text-gray-500 hover:text-white transition-colors">
                    Dashboard
                </Link>
                <span className="text-gray-700">/</span>
                <Link href="/contas-a-receber" className="text-gray-500 hover:text-white transition-colors">
                    Contas à Receber
                </Link>
                <span className="text-gray-700">/</span>
                <span className="text-[#ffa300] font-semibold">Consultar Clientes</span>
            </nav>

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
                        Gestão de Clientes
                    </h1>
                    <p className="text-xs text-gray-500 font-medium">
                        {allClients.length} clientes cadastrados
                    </p>
                </div>
                <Link
                    href="/cadastro"
                    className="flex items-center gap-2 rounded-xl bg-[#ffa300] hover:bg-orange-400 active:bg-orange-600 transition-colors px-5 py-2.5 text-xs font-bold text-black shrink-0"
                >
                    <Plus size={14} strokeWidth={2.5} />
                    Novo Cliente
                </Link>
            </div>

            {/* KPI Filter Cards — clicking an active card clears the filter */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Link href={currentFilter === "em dia" ? "/consultar-clientes" : "/consultar-clientes?status=em dia"}>
                    <div className={`flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border p-5 transition-all shadow-2xl ${currentFilter === "em dia" ? "border-[#34C759]/40 shadow-[0_0_15px_rgba(52,199,89,0.1)]" : "border-white/5 hover:border-[#34C759]/30"}`}>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#34C759]">
                            <CheckCircle2 size={13} />
                            Em Dia
                        </div>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{countEmDia}</span>
                    </div>
                </Link>
                <Link href={currentFilter === "atraso" ? "/consultar-clientes" : "/consultar-clientes?status=atraso"}>
                    <div className={`flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border p-5 transition-all shadow-2xl ${currentFilter === "atraso" ? "border-[#FF9500]/40 shadow-[0_0_15px_rgba(255,149,0,0.1)]" : "border-white/5 hover:border-[#FF9500]/30"}`}>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#FF9500]">
                            <Clock size={13} />
                            Em Atraso
                        </div>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{countAtraso}</span>
                    </div>
                </Link>
                <Link href={currentFilter === "inadimplente" ? "/consultar-clientes" : "/consultar-clientes?status=inadimplente"}>
                    <div className={`flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border p-5 transition-all shadow-2xl ${currentFilter === "inadimplente" ? "border-[#FF453A]/40 shadow-[0_0_15px_rgba(255,69,58,0.1)]" : "border-white/5 hover:border-[#FF453A]/30"}`}>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#FF453A]">
                            <AlertCircle size={13} />
                            Inadimplente
                        </div>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{countInadimplente}</span>
                    </div>
                </Link>
                <Link href={currentFilter === "perda" ? "/consultar-clientes" : "/consultar-clientes?status=perda"}>
                    <div className={`flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border p-5 transition-all shadow-2xl ${currentFilter === "perda" ? "border-[#FF3B30]/40 shadow-[0_0_15px_rgba(255,59,48,0.12)]" : "border-white/5 hover:border-[#FF3B30]/30"}`}>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#FF3B30]">
                            <ShieldAlert size={13} />
                            Perda de Faturamento
                        </div>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{countPerda}</span>
                    </div>
                </Link>
            </div>

            {/* Filter bar + clear */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                    {/* Live search — Client Component */}
                    <ClientSearchInput />
                    <button className="flex items-center gap-2 rounded-xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl px-4 py-2.5 text-xs text-gray-400 hover:border-orange-500 transition-colors">
                        <SlidersHorizontal size={13} />
                        Filtros
                    </button>
                </div>

                {/* Clear filter */}
                {currentFilter !== "todos" && (
                    <Link
                        href="/consultar-clientes"
                        className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                    >
                        <X size={13} />
                        Limpar filtro
                    </Link>
                )}
            </div>

            {/* Data Table */}
            <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">

                {/* Table header info */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <p className="text-sm font-semibold text-white">
                        {currentFilter === "todos"
                            ? "Todos os clientes"
                            : `Filtro: ${currentFilter.toUpperCase()}`}
                    </p>
                    <p className="text-xs text-gray-500">
                        {filteredClients.length} resultado{filteredClients.length !== 1 ? "s" : ""}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Cliente / Empresa
                                </th>
                                <th className="text-left px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Tipo
                                </th>
                                <th className="text-right px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Valor Total
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Próx. Vencimento
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Status
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Ação
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="text-center py-16 text-gray-600 text-sm"
                                    >
                                        <span className="text-3xl block mb-2">🔍</span>
                                        Nenhum cliente encontrado para este filtro.
                                    </td>
                                </tr>
                            ) : (
                                filteredClients.map((client) => (
                                    <tr
                                        key={client.id}
                                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
                                    >
                                        {/* Cliente / Empresa */}
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-semibold text-white leading-tight flex items-center gap-2">
                                                {client.nomeCliente}
                                                {client.deletedAt && (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded bg-red-500/15 border border-red-500/30 text-red-400 shrink-0">
                                                        EXCLUÍDO
                                                    </span>
                                                )}
                                            </p>
                                            {client.empresaLabel && (
                                                <p className="text-[11px] text-gray-500 mt-0.5">
                                                    {client.empresaLabel}
                                                </p>
                                            )}
                                        </td>

                                        {/* Tipo Contrato */}
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-orange-400">
                                                {client.tipoContrato ?? "—"}
                                            </span>
                                        </td>

                                        {/* Valor Total */}
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-semibold text-white">
                                                {brl(client.valorTotalAtivo)}
                                            </span>
                                        </td>

                                        {/* Próx. Vencimento */}
                                        <td className="px-6 py-4 text-center">
                                            <span
                                                className={`text-xs font-medium ${client.proximoVencimento &&
                                                    client.proximoVencimento < todayStr
                                                    ? "text-red-400"
                                                    : "text-gray-300"
                                                    }`}
                                            >
                                                {fmtDate(client.proximoVencimento)}
                                            </span>
                                        </td>

                                        {/* Status Badge */}
                                        <td className="px-6 py-4 text-center">
                                            <span
                                                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusStyle[client.status]
                                                    }`}
                                            >
                                                {client.status}
                                            </span>
                                        </td>

                                        {/* Action */}
                                        <td className="px-6 py-4 text-center">
                                            <Link
                                                href={`/cliente/${client.id}`}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 hover:border-orange-500 hover:text-orange-400 text-gray-400 px-3 py-1.5 text-xs font-medium transition-all"
                                            >
                                                Ver Ficha
                                                <ChevronRight size={13} />
                                            </Link>
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
