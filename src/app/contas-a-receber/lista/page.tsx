import Link from "next/link";
import {
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    CheckCircle2,
    AlertTriangle,
    ExternalLink,
    CircleDollarSign,
    Landmark,
    Wallet,
    Users,
    ArrowDownCircle,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, daysLate, toDateStr } from "@/lib/utils";
import { getRiskStatus, getContratosSujos } from "@/lib/financeRules";
import ParcelaActions, { ParcelaForActions } from "@/components/ParcelaActions";
import OperacoesToolbar from "@/components/OperacoesToolbar";

// ─── Raw DB types ─────────────────────────────────────────────────────────────
interface RawPagamento {
    valor_pago?: number | null;
    taxa_gateway?: number | null;
    plataforma?: string | null;
    status_pagamento?: string | null;
}

interface RawCliente {
    id?: string | null;
    nome_cliente?: string | null;
    empresa_label?: string | null;
    status_cliente?: string | null;
    link_asana?: string | null;
    deleted_at?: string | null;
}

interface RawContrato {
    deleted_at?: string | null;
    agencia_id?: string | null;
    tipo_contrato?: string | null;
    parcelas_total?: number | null;
    forma_pagamento?: string | null;
    dim_agencias?: { nome?: string | null } | { nome?: string | null }[] | null;
    clientes?: RawCliente | null;
}

interface RawParcela {
    id: string;
    contrato_id: string | null;
    valor_previsto: number;
    valor_bruto?: number | null;
    data_vencimento: string;
    status_manual_override: string;
    deleted_at?: string | null;
    observacao?: string | null;
    categoria?: string | null;
    numero_referencia?: number | null;
    sub_indice?: number | null;
    juros_aplicado?: number | null;
    contratos?: RawContrato | null;
    pagamentos?: RawPagamento[] | null;
}

// ─── Classified row ───────────────────────────────────────────────────────────
type RowStatus =
    | "PAGO"
    | "INADIMPLENTE"
    | "PERDA"
    | "POSSUI_INADIMPLENCIA"
    | "ATRASADO"
    | "VENCE_HOJE"
    | "A_RECEBER";

interface Row extends RawParcela {
    rowStatus: RowStatus;
    daysLateVal: number;
    agenciaNome: string | null;
    pagamento: RawPagamento | null;
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ row }: { row: Row }) {
    const map: Record<RowStatus, string> = {
        PAGO: "bg-green-500/15 text-green-400 border-green-500/30",
        INADIMPLENTE: "bg-red-900/40 text-red-300 border-red-700/60",
        PERDA: "bg-red-900/60 text-red-200 border-red-800",
        POSSUI_INADIMPLENCIA: "bg-orange-900/30 text-orange-300 border-orange-700/50",
        ATRASADO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
        VENCE_HOJE: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
        A_RECEBER: "bg-white/5 text-gray-400 border-white/10",
    };
    const labels: Record<RowStatus, string> = {
        PAGO: "Pago",
        INADIMPLENTE: `Inadimp. ${row.daysLateVal}d`,
        PERDA: `Perda ${row.daysLateVal}d`,
        POSSUI_INADIMPLENCIA: "Contaminado",
        ATRASADO: `Atraso ${row.daysLateVal}d`,
        VENCE_HOJE: "Vence Hoje",
        A_RECEBER: "A Receber",
    };
    return (
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide border whitespace-nowrap ${map[row.rowStatus]}`}>
            {labels[row.rowStatus]}
        </span>
    );
}

// ─── Client status badge ───────────────────────────────────────────────────────
function ClienteBadge({ status }: { status: string | null | undefined }) {
    if (!status) return <span className="text-gray-600">—</span>;
    const ok = status === "ATIVO";
    return (
        <span className={`text-[8px] font-bold uppercase rounded px-1 py-0.5 ${ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            {status}
        </span>
    );
}

// ─── Row background ───────────────────────────────────────────────────────────
function rowCls(row: Row): string {
    if (row.rowStatus === "PAGO") return "opacity-40 hover:opacity-60";
    if (row.rowStatus === "PERDA") return "bg-red-900/30 hover:bg-red-900/40";
    if (row.rowStatus === "INADIMPLENTE") return "bg-red-900/20 hover:bg-red-900/30";
    if (row.rowStatus === "POSSUI_INADIMPLENCIA") return "bg-orange-900/15 hover:bg-orange-900/25";
    if (row.rowStatus === "ATRASADO") return "bg-yellow-900/10 hover:bg-yellow-900/20";
    if (row.rowStatus === "VENCE_HOJE") return "bg-cyan-900/10 hover:bg-cyan-900/20";
    return "hover:bg-white/[0.03]";
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
    icon,
    label,
    value,
    sub,
    color = "orange",
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    color?: "orange" | "green" | "red" | "blue" | "gray";
}) {
    const colors = {
        orange: "bg-orange-500/10 border-orange-500/20 text-orange-500",
        green: "bg-green-500/10 border-green-500/20 text-green-400",
        red: "bg-red-500/10 border-red-500/20 text-red-400",
        blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        gray: "bg-white/5 border-white/10 text-gray-400",
    };
    return (
        <div className={`flex flex-col gap-1 rounded-xl border px-5 py-3.5 ${colors[color]}`}>
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest opacity-70">
                {icon}
                {label}
            </div>
            <span className="text-xl font-black leading-none">{value}</span>
            {sub && <span className="text-[9px] text-gray-500">{sub}</span>}
        </div>
    );
}

// ─── Small numeric display ────────────────────────────────────────────────────
function Num({ v, muted }: { v: number | null | undefined; muted?: boolean }) {
    if (v == null) return <span className="text-gray-600">—</span>;
    return <span className={muted ? "text-gray-500" : ""}>{brl(v)}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function OperacoesPage({
    searchParams,
}: {
    searchParams: Promise<{
        month?: string;
        status?: string;
        agencia?: string;
        categoria?: string;
        search?: string;
    }>;
}) {
    const p = await searchParams;
    const currentMonth = p.month ?? new Date().toISOString().slice(0, 7);
    const statusFilter = (p.status ?? "").toLowerCase();
    const agenciaFilter = p.agencia ?? "";
    const categoriaFilter = p.categoria ?? "";
    const searchFilter = (p.search ?? "").toLowerCase().trim();
    const todayStr = toDateStr(new Date());

    // ── Labels ─────────────────────────────────────────────────────────────────
    const [y, mo] = currentMonth.split("-").map(Number);
    const monthLabel = new Date(currentMonth + "-01T12:00:00").toLocaleDateString("pt-BR", {
        month: "long", year: "numeric",
    });
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const prevMonth = (() => {
        const d = new Date(y, mo - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const nextMonth = (() => {
        const d = new Date(y, mo, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();

    // ── Date range ─────────────────────────────────────────────────────────────
    const startDate = `${currentMonth}-01`;
    const lastDay = new Date(y, mo, 0).getDate();
    const endDate = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

    // ── Month nav URLs — preserve all active filters ──────────────────────────
    const buildMonthUrl = (m: string) => {
        const qs = new URLSearchParams();
        qs.set("month", m);
        if (p.status)    qs.set("status", p.status);
        if (p.agencia)   qs.set("agencia", p.agencia);
        if (p.categoria) qs.set("categoria", p.categoria);
        if (p.search)    qs.set("search", p.search);
        return `?${qs.toString()}`;
    };
    const prevMonthUrl = buildMonthUrl(prevMonth);
    const nextMonthUrl = buildMonthUrl(nextMonth);

    // ── Supabase query ─────────────────────────────────────────────────────────
    const { data: rawData, error } = await supabaseAdmin
        .from("parcelas")
        .select(`
            id, contrato_id, valor_previsto, valor_bruto,
            data_vencimento, status_manual_override,
            observacao, deleted_at, categoria,
            numero_referencia, sub_indice, juros_aplicado,
            contratos(
                deleted_at, agencia_id, tipo_contrato, parcelas_total, forma_pagamento,
                dim_agencias(nome),
                clientes(id, nome_cliente, empresa_label, status_cliente, link_asana, deleted_at)
            ),
            pagamentos(valor_pago, taxa_gateway, plataforma, status_pagamento)
        `)
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lte("data_vencimento", endDate)
        .order("data_vencimento", { ascending: true });

    if (error) console.error("[OperacoesPage] DB error:", error.message);

    const allParcelas = (rawData ?? []) as unknown as RawParcela[];

    // ── Taint detection ────────────────────────────────────────────────────────
    const contratosSujos = getContratosSujos(allParcelas, todayStr);

    // ── Classify ──────────────────────────────────────────────────────────────
    const classified: Row[] = allParcelas
        .filter((p) => {
            if (p.deleted_at) return false;
            const ct = p.contratos as any;
            if (ct?.deleted_at || (ct?.clientes as any)?.deleted_at) return false;
            const s = p.status_manual_override ?? "";
            return !["RENOVAR CONTRATO", "FINALIZAR PROJETO", "QUEBRA DE CONTRATO", "RENOVADO"].includes(s);
        })
        .map((p): Row => {
            const dl = daysLate(p.data_vencimento, todayStr);
            const risk = getRiskStatus(dl);
            const s = p.status_manual_override ?? "";
            const ct = p.contratos as any;
            const rawAgencia = ct?.dim_agencias;
            const agenciaNome: string | null = rawAgencia
                ? (Array.isArray(rawAgencia) ? (rawAgencia[0]?.nome ?? null) : (rawAgencia.nome ?? null))
                : null;

            // Pagamento (can be array or single object depending on supabase schema)
            const pagamentoRaw = p.pagamentos;
            const pagamento: RawPagamento | null = Array.isArray(pagamentoRaw)
                ? (pagamentoRaw[0] ?? null)
                : (pagamentoRaw ?? null);

            let rowStatus: RowStatus;
            if (s === "PAGO" || s === "INADIMPLENTE RECEBIDO") {
                rowStatus = "PAGO";
            } else if (s === "INADIMPLENTE" || s === "PERDA DE FATURAMENTO") {
                rowStatus = risk === "PERDA" ? "PERDA" : "INADIMPLENTE";
            } else if (s === "POSSUI INADIMPLENCIA") {
                rowStatus = "POSSUI_INADIMPLENCIA";
            } else if (s === "NORMAL" && p.contrato_id && contratosSujos.has(p.contrato_id) && dl <= 0) {
                rowStatus = "POSSUI_INADIMPLENCIA";
            } else if (risk === "PERDA") {
                rowStatus = "PERDA";
            } else if (risk === "INADIMPLENTE") {
                rowStatus = "INADIMPLENTE";
            } else if (risk === "ATRASO") {
                rowStatus = "ATRASADO";
            } else if (p.data_vencimento === todayStr) {
                rowStatus = "VENCE_HOJE";
            } else {
                rowStatus = "A_RECEBER";
            }

            return { ...p, rowStatus, daysLateVal: Math.max(0, dl), agenciaNome, pagamento };
        });

    // ── Derive filter options from data ────────────────────────────────────────
    const agencias = [...new Set(classified.map(r => r.agenciaNome).filter(Boolean) as string[])].sort();
    const categorias = [...new Set(classified.map(r => r.categoria).filter(Boolean) as string[])].sort();

    // ── Client-side filters ────────────────────────────────────────────────────
    const visible = classified.filter((row) => {
        // Status filter
        if (statusFilter) {
            if (statusFilter === "pagos" && row.rowStatus !== "PAGO") return false;
            if (statusFilter === "a_receber" && row.rowStatus !== "A_RECEBER") return false;
            if (statusFilter === "vence_hoje" && row.rowStatus !== "VENCE_HOJE") return false;
            if (statusFilter === "atrasados" && row.rowStatus !== "ATRASADO") return false;
            if (
                statusFilter === "inadimplentes" &&
                row.rowStatus !== "INADIMPLENTE" &&
                row.rowStatus !== "PERDA" &&
                row.rowStatus !== "POSSUI_INADIMPLENCIA"
            ) return false;
        }
        // Agência filter
        if (agenciaFilter && row.agenciaNome !== agenciaFilter) return false;
        // Categoria filter
        if (categoriaFilter && row.categoria !== categoriaFilter) return false;
        // Text search
        if (searchFilter) {
            const ct = row.contratos as any;
            const nome = (ct?.clientes?.nome_cliente ?? "").toLowerCase();
            const emp = (ct?.clientes?.empresa_label ?? "").toLowerCase();
            if (!nome.includes(searchFilter) && !emp.includes(searchFilter)) return false;
        }
        return true;
    });

    // ── KPIs ───────────────────────────────────────────────────────────
    const kpiCount = visible.length;
    const kpiTotalPrevisto = visible.reduce((s, r) => s + r.valor_previsto, 0);
    const kpiFaturadoLiquido = visible.reduce((s, r) => s + (r.pagamento?.valor_pago ?? 0), 0);
    const kpiTaxas = visible.reduce((s, r) => s + (r.pagamento?.taxa_gateway ?? 0), 0);
    const kpiAReceber = visible
        .filter(r => r.rowStatus !== "PAGO")
        .reduce((s, r) => s + r.valor_previsto, 0);

    // ── Platform Forecast strip ──────────────────────────────────────────
    // Aggregate by platform: for paid rows use pagamento.plataforma, for open rows use
    // contratos.forma_pagamento as the expected platform
    const platformMap = new Map<string, { recebido: number; pendente: number; count_pendente: number }>();
    for (const row of visible) {
        const ct = row.contratos as any;
        const platform: string = row.rowStatus === "PAGO"
            ? (row.pagamento?.plataforma ?? ct?.forma_pagamento ?? "Outros")
            : (ct?.forma_pagamento ?? "Sem Plataforma");
        const key = platform || "Outros";
        if (!platformMap.has(key)) platformMap.set(key, { recebido: 0, pendente: 0, count_pendente: 0 });
        const entry = platformMap.get(key)!;
        if (row.rowStatus === "PAGO") {
            entry.recebido += row.pagamento?.valor_pago ?? 0;
        } else {
            entry.pendente += row.valor_previsto;
            entry.count_pendente += 1;
        }
    }
    const platformEntries = [...platformMap.entries()].sort((a, b) => (b[1].recebido + b[1].pendente) - (a[1].recebido + a[1].pendente));

    // ── Column header class ────────────────────────────────────────────────────
    const TH = "px-2 py-2 text-left text-[9px] font-bold text-orange-500 uppercase tracking-widest whitespace-nowrap select-none";
    const TD = "px-2 py-2 whitespace-nowrap";

    return (
        <div className="flex flex-col gap-5 max-w-[1600px] mx-auto">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-[10px]">
                <Link href="/" className="text-gray-500 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-700">/</span>
                <Link href="/contas-a-receber" className="text-gray-500 hover:text-white transition-colors">Contas à Receber</Link>
                <span className="text-gray-700">/</span>
                <span className="text-orange-500 font-semibold">Mesa de Operações</span>
            </nav>

            {/* ── Date Navigator ── */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-[9px] text-orange-500 font-bold uppercase tracking-widest">Finance Control Room</p>
                    <h1 className="text-2xl font-black text-white tracking-tight leading-none">Mesa de Operações</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={prevMonthUrl}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 hover:border-orange-500/50 hover:text-orange-400 transition-all"
                        aria-label="Mês anterior"
                    >
                        <ChevronLeft size={15} />
                    </Link>
                    <span className="text-lg font-black text-orange-400 min-w-[10rem] text-center tracking-tight">{monthLabelCap}</span>
                    <Link
                        href={nextMonthUrl}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 hover:border-orange-500/50 hover:text-orange-400 transition-all"
                        aria-label="Próximo mês"
                    >
                        <ChevronRight size={15} />
                    </Link>
                </div>
            </div>

            {/* ── KPI Panel ── */}
            <div className="flex flex-wrap gap-3">
                <KpiCard
                    icon={<Users size={9} />}
                    label="Contas no filtro"
                    value={`${kpiCount}`}
                    sub={`${classified.length} no mês`}
                    color="gray"
                />
                <KpiCard
                    icon={<TrendingUp size={9} />}
                    label="Total Previsto"
                    value={brl(kpiTotalPrevisto)}
                    color="orange"
                />
                <KpiCard
                    icon={<Landmark size={9} />}
                    label="Faturado Líquido"
                    value={brl(kpiFaturadoLiquido)}
                    sub={kpiTaxas > 0 ? `− ${brl(kpiTaxas)} taxas` : undefined}
                    color="green"
                />
                {kpiTaxas > 0 && (
                    <KpiCard
                        icon={<ArrowDownCircle size={9} />}
                        label="Taxas Plataforma"
                        value={brl(kpiTaxas)}
                        color="red"
                    />
                )}
                <KpiCard
                    icon={<Wallet size={9} />}
                    label="A Receber"
                    value={brl(kpiAReceber)}
                    color="blue"
                />
            </div>

            {/* ── Platform Forecast Strip ── */}
            {platformEntries.length > 0 && (
                <div className="rounded-xl bg-white/[0.02] border border-white/10 p-3">
                    <p className="text-[8px] font-bold text-orange-500 uppercase tracking-widest mb-2">Previsão por Plataforma</p>
                    <div className="flex flex-wrap gap-2">
                        {platformEntries.map(([platform, data]) => (
                            <div key={platform} className="flex flex-col gap-0.5 rounded-lg bg-white/[0.03] border border-white/[0.07] px-3 py-2 min-w-[130px]">
                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">{platform}</span>
                                {data.recebido > 0 && (
                                    <span className="text-[10px] font-bold text-green-400">{brl(data.recebido)} <span className="text-[8px] text-gray-600 font-normal">recebido</span></span>
                                )}
                                {data.pendente > 0 && (
                                    <span className="text-[10px] font-semibold text-gray-400">{brl(data.pendente)} <span className="text-[8px] text-gray-600 font-normal">{data.count_pendente}p pend.</span></span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Main Card ── */}
            <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">

                {/* Toolbar (Client Component) */}
                <OperacoesToolbar
                    agencias={agencias}
                    categorias={categorias}
                    status={statusFilter}
                    agencia={agenciaFilter}
                    categoria={categoriaFilter}
                    search={searchFilter}
                />

                {/* Results summary */}
                <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">
                        <span className="text-white font-bold">{visible.length}</span> parcelas encontradas
                    </span>
                    <span className="text-[10px] font-bold text-orange-400">{brl(kpiTotalPrevisto)}</span>
                </div>

                {/* Table */}
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <span className="text-4xl">📭</span>
                        <span className="text-sm font-medium text-gray-500">Nenhuma parcela para este filtro</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[10px]" style={{ minWidth: "1200px" }}>
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.01] sticky top-0 z-10">
                                    <th className={TH}>St. Cliente</th>
                                    <th className={TH}>Categoria</th>
                                    <th className={`${TH}`} style={{ minWidth: "160px" }}>Cliente / Empresa</th>
                                    <th className={TH}>Agência</th>
                                    <th className={TH}>Vencimento</th>
                                    <th className={TH}>Status</th>
                                    <th className={`${TH} text-right`}>Atraso</th>
                                    <th className={`${TH} text-center`}>Parcela</th>
                                    <th className={`${TH} text-right`}>Líquido Prev.</th>
                                    <th className={`${TH} text-right`}>Pago</th>
                                    <th className={TH}>Plataforma</th>
                                    <th className={`${TH} text-right`}>Ação</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-white/[0.035]">
                                {visible.map((row) => {
                                    const ct = row.contratos as any;
                                    const cliente = ct?.clientes as RawCliente | null;
                                    const clienteId = cliente?.id ?? null;
                                    const nome = cliente?.nome_cliente ?? "—";
                                    const empresa = cliente?.empresa_label as string | null;
                                    const linkAsana = cliente?.link_asana as string | null;
                                    const isPago = row.rowStatus === "PAGO";

                                    const parcelaRef = (() => {
                                        const nr = row.numero_referencia;
                                        const si = row.sub_indice;
                                        const total = ct?.parcelas_total as number | null;
                                        if (!nr && nr !== 0) return "—";
                                        const label = si && si > 0 ? `${nr}-${si}` : `${nr}`;
                                        return total ? `${label}/${total}` : label;
                                    })();

                                    const parcelaData: ParcelaForActions = {
                                        id: row.id,
                                        valor_previsto: row.valor_previsto,
                                        valor_bruto: row.valor_bruto ?? undefined,
                                        imposto_percentual: (ct?.imposto_percentual as number | null) ?? undefined,
                                        status_manual_override: row.status_manual_override,
                                        numero_referencia: row.numero_referencia ?? undefined,
                                        sub_indice: row.sub_indice ?? null,
                                        forma_pagamento_contrato: ct?.forma_pagamento ?? undefined,
                                        observacao: row.observacao ?? null,
                                        data_vencimento: row.data_vencimento,
                                        hasPagamento: isPago,
                                        contrato_id: row.contrato_id ?? null,
                                        cliente_id: clienteId,
                                    };

                                    const dateTxt = isPago
                                        ? `${rowBg_dateText(row)} line-through`
                                        : rowBg_dateText(row);

                                    return (
                                        <tr key={row.id} className={`group transition-colors ${rowCls(row)}`}>

                                            {/* St. Cliente */}
                                            <td className={TD}>
                                                <ClienteBadge status={cliente?.status_cliente} />
                                            </td>

                                            {/* Categoria */}
                                            <td className={TD}>
                                                <span className="inline-block rounded px-1.5 py-0.5 bg-white/[0.05] border border-white/[0.07] text-[8px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                                                    {row.categoria ?? "—"}
                                                </span>
                                            </td>

                                            {/* Cliente / Empresa */}
                                            <td className={`${TD} max-w-[200px]`}>
                                                {clienteId ? (
                                                    <Link href={`/cliente/${clienteId}`} className="hover:text-orange-400 transition-colors block">
                                                        <p className={`font-semibold truncate ${isPago ? "text-gray-500" : "text-white"}`}>{nome}</p>
                                                        {empresa && (
                                                            <p className="text-[9px] text-gray-600 truncate flex items-center gap-1">
                                                                {empresa}
                                                                {linkAsana && (
                                                                    <a
                                                                        href={linkAsana}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="inline-flex items-center text-purple-500 hover:text-purple-300 transition-colors shrink-0"
                                                                        title="Abrir no Asana"
                                                                    >
                                                                        <ExternalLink size={8} />
                                                                    </a>
                                                                )}
                                                            </p>
                                                        )}
                                                        {!empresa && linkAsana && (
                                                            <a
                                                                href={linkAsana}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="inline-flex items-center gap-0.5 text-[9px] text-purple-500 hover:text-purple-300 transition-colors"
                                                                title="Abrir no Asana"
                                                            >
                                                                <ExternalLink size={8} /> Asana
                                                            </a>
                                                        )}
                                                    </Link>
                                                ) : (
                                                    <>
                                                        <p className="font-semibold text-gray-500 truncate">{nome}</p>
                                                        {empresa && <p className="text-[9px] text-gray-600 truncate">{empresa}</p>}
                                                    </>
                                                )}
                                            </td>

                                            {/* Agência */}
                                            <td className={`${TD} text-gray-400`}>{row.agenciaNome ?? "—"}</td>

                                            {/* Vencimento */}
                                            <td className={`${TD} font-mono ${dateTxt}`}>
                                                {fmtDate(row.data_vencimento)}
                                            </td>

                                            {/* Status */}
                                            <td className={TD}>
                                                <StatusPill row={row} />
                                            </td>

                                            {/* Atraso */}
                                            <td className={`${TD} text-right font-mono`}>
                                                {row.daysLateVal > 0
                                                    ? <span className="text-red-400 font-bold">{row.daysLateVal}d</span>
                                                    : <span className="text-gray-600">—</span>
                                                }
                                            </td>

                                            {/* Parcela */}
                                            <td className={`${TD} text-center font-mono text-gray-400`}>
                                                {parcelaRef}
                                            </td>

                                            {/* Líquido Prev. */}
                                            <td className={`${TD} text-right font-bold ${isPago ? "text-gray-500" : row.rowStatus === "INADIMPLENTE" || row.rowStatus === "PERDA" ? "text-red-400" : "text-white"}`}>
                                                {brl(row.valor_previsto)}
                                            </td>

                                            {/* Pago */}
                                            <td className={`${TD} text-right`}>
                                                {row.pagamento?.valor_pago != null
                                                    ? <span className="text-green-400 font-semibold">{brl(row.pagamento.valor_pago)}</span>
                                                    : <span className="text-gray-700">—</span>
                                                }
                                            </td>

                                            {/* Plataforma */}
                                            <td className={`${TD} text-gray-500`}>
                                                {row.pagamento?.plataforma ?? "—"}
                                            </td>

                                            {/* Ação */}
                                            <td className={`${TD} text-right`}>
                                                <ParcelaActions parcela={parcelaData} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                            {/* Footer */}
                            <tfoot>
                                <tr className="border-t border-white/10 bg-white/[0.01]">
                                    <td colSpan={8} className="px-2 py-3 text-[9px] text-gray-600 uppercase tracking-widest font-bold">
                                        {visible.length} parcelas · {monthLabelCap}
                                    </td>
                                    <td className="px-2 py-3 text-right font-black text-orange-500 text-sm whitespace-nowrap">
                                        {brl(kpiTotalPrevisto)}
                                    </td>
                                    <td className="px-2 py-3 text-right font-black text-green-400 whitespace-nowrap">
                                        {kpiFaturadoLiquido > 0 ? brl(kpiFaturadoLiquido) : "—"}
                                    </td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Helper: date text color per row status ────────────────────────────────────
function rowBg_dateText(row: Row): string {
    if (row.rowStatus === "INADIMPLENTE" || row.rowStatus === "PERDA") return "text-red-400";
    if (row.rowStatus === "ATRASADO") return "text-yellow-400";
    if (row.rowStatus === "VENCE_HOJE") return "text-cyan-400";
    if (row.rowStatus === "PAGO") return "text-gray-600";
    return "text-gray-300";
}
