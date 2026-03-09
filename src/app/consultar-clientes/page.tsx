import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Plus, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import KpiCard from "@/components/KpiCard";
import ClientSearchInput from "@/components/ClientSearchInput";

// ─── Types ───────────────────────────────────────────────────────────────────
type ClientStatus = "EM DIA" | "ATRASO" | "INADIMPLENTE" | "PERDA" | "CONCLUÍDO";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const toDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysLate = (dueDateStr: string, todayStr: string): number => {
    const due = new Date(dueDateStr + "T00:00:00");
    const tod = new Date(todayStr + "T00:00:00");
    return Math.round((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
};

const fmtDate = (iso: string | null): string => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
};

// ─── Status badge style map ───────────────────────────────────────────────────
const statusStyle: Record<ClientStatus, string> = {
    "EM DIA": "bg-green-500/10 text-green-400 border border-green-500/20",
    "ATRASO": "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    "INADIMPLENTE": "bg-red-500/10 text-red-400 border border-red-500/20",
    "PERDA": "bg-red-900/20 text-red-600 border border-red-700/30",
    "CONCLUÍDO": "bg-gray-500/10 text-gray-400 border border-gray-500/20",
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
            "id, nome_cliente, empresa_label, deleted_at, contratos(id, tipo_contrato, valor_total_contrato, parcelas(data_vencimento, status_manual_override, valor_previsto))"
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

            // Flat list of open parcels across ALL contracts
            const openParcelas = contratos.flatMap((ct) =>
                (ct.parcelas ?? []).filter(
                    (p) => p.status_manual_override === "NORMAL"
                )
            );

            // Cross-default: worst delay across all open parcels
            let status: ClientStatus = "CONCLUÍDO";
            if (openParcelas.length > 0) {
                const maxLate = Math.max(
                    ...openParcelas.map((p) => daysLate(p.data_vencimento, todayStr))
                );
                if (maxLate > 30) status = "PERDA";
                else if (maxLate >= 15) status = "INADIMPLENTE";
                else if (maxLate >= 1) status = "ATRASO";
                else status = "EM DIA";
            }

            // Sum total active contract value
            const valorTotalAtivo = contratos.reduce(
                (s, ct) => s + (ct.valor_total_contrato ?? 0),
                0
            );

            // Próximo vencimento: earliest upcoming date, or latest overdue date
            const sortedDates = openParcelas
                .map((p) => p.data_vencimento)
                .sort();
            const futureDates = sortedDates.filter((d) => d >= todayStr);
            const proximoVencimento =
                futureDates[0] ?? sortedDates[sortedDates.length - 1] ?? null;

            // Primary tipo_contrato (from first contract)
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
        <div className="flex flex-col gap-8">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                    Dashboard
                </Link>
                <span className="text-gray-600">/</span>
                <Link href="/contas-a-receber" className="text-gray-400 hover:text-white transition-colors">
                    Contas a receber
                </Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Consultar Clientes</span>
            </nav>

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Gestão de Clientes
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {allClients.length} clientes cadastrados
                    </p>
                </div>
                <Link
                    href="/cadastro"
                    className="flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors px-5 py-2.5 text-sm font-bold text-black shrink-0"
                >
                    <Plus size={16} strokeWidth={2.5} />
                    Novo Cliente
                </Link>
            </div>

            {/* KPI Filter Cards — clicking an active card clears the filter */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Link href={currentFilter === "em dia" ? "/consultar-clientes" : "/consultar-clientes?status=em dia"}>
                    <KpiCard
                        title="Em Dia"
                        value={countEmDia}
                        subtitle="Contratos sem atraso"
                        colorTheme="green"
                        isActive={currentFilter === "em dia"}
                    />
                </Link>
                <Link href={currentFilter === "atraso" ? "/consultar-clientes" : "/consultar-clientes?status=atraso"}>
                    <KpiCard
                        title="Em Atraso"
                        value={countAtraso}
                        subtitle="1 a 14 dias de atraso"
                        colorTheme="orange"
                        isActive={currentFilter === "atraso"}
                    />
                </Link>
                <Link href={currentFilter === "inadimplente" ? "/consultar-clientes" : "/consultar-clientes?status=inadimplente"}>
                    <KpiCard
                        title="Inadimplente"
                        value={countInadimplente}
                        subtitle="15 a 30 dias de atraso"
                        colorTheme="red"
                        isActive={currentFilter === "inadimplente"}
                    />
                </Link>
                <Link href={currentFilter === "perda" ? "/consultar-clientes" : "/consultar-clientes?status=perda"}>
                    <KpiCard
                        title="Perda de Faturamento"
                        value={countPerda}
                        subtitle="Mais de 30 dias em aberto"
                        colorTheme="darkRed"
                        isActive={currentFilter === "perda"}
                    />
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
