import Link from "next/link";
import {
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Landmark,
    Wallet,
    Users,
    ArrowDownCircle,
    ExternalLink
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, daysLate, toDateStr } from "@/lib/utils";
import { syncFinanceStatuses } from "@/lib/financeRules";
import ParcelaActions, { type ParcelaForActions } from "@/components/ParcelaActions";
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
    imposto_percentual?: number | null;
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
type RowStatus = "PAGO" | "INADIMPLENTE" | "PERDA" | "EM_INADIMPLENCIA" | "ATRASADO" | "VENCE_HOJE" | "A_RECEBER";

interface Row extends RawParcela {
    rowStatus: RowStatus;
    daysLateVal: number;
    agenciaNome: string | null;
    pagamento: RawPagamento | null;
}

// ─── Status Pill — Strict Traffic-Light System ───────────────────────────────
function StatusPill({ row }: { row: Row }) {
    // Each status has a distinct, unambiguous color
    const map: Record<RowStatus, string> = {
        PAGO:            "text-[#34C759]  bg-[#34C759]/10",
        A_RECEBER:       "text-gray-400   bg-white/5",
        VENCE_HOJE:      "text-[#028aa4]  bg-[#028aa4]/10",
        ATRASADO:        "text-[#FF9500]  bg-[#FF9500]/10",
        EM_INADIMPLENCIA:"text-[#FF453A]  bg-[#FF453A]/10",
        INADIMPLENTE:    "text-[#FF453A]  bg-[#FF453A]/10",
        PERDA:           "text-[#FF3B30]  bg-[#FF3B30]/20  border border-[#FF3B30]/30",
    };
    const labels: Record<RowStatus, string> = {
        PAGO:            "Pago",
        A_RECEBER:       "A Receber",
        VENCE_HOJE:      "Vence Hoje",
        ATRASADO:        "Atrasado",
        EM_INADIMPLENCIA:"Inadimplência",
        INADIMPLENTE:    "Inadimplente",
        PERDA:           "Perda",
    };
    // Show days overdue for ATRASADO
    const suffix = row.rowStatus === "ATRASADO" && row.daysLateVal > 0
        ? ` +${row.daysLateVal}d`
        : "";
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap ${map[row.rowStatus]}`}>
            {labels[row.rowStatus]}{suffix}
        </span>
    );
}

function ClienteBadge({ status }: { status: string | null | undefined }) {
    if (!status) return <span className="text-gray-600">—</span>;
    const colorMap: Record<string, string> = {
        ATIVO:          "bg-[#34C759]/10 text-[#34C759]",
        INADIMPLENTE:   "bg-[#FF453A]/10 text-[#FF453A]",
        EM_INADIMPLENCIA:"bg-[#FF453A]/10 text-[#FF453A]",
    };
    const cls = colorMap[status] ?? "bg-white/5 text-gray-400";
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap ${cls}`}>
            {status}
        </span>
    );
}

// ─── KPI Card — Apple/Linear aesthetic ───────────────────────────────────────
function KpiCard({ icon, label, value, color = "orange" }: { icon: React.ReactNode; label: string; value: string; color?: "orange" | "green" | "red" | "blue" | "gray"; }) {
    const textColors = {
        orange: "text-[#ffa300]",
        green:  "text-[#34C759]",
        red:    "text-[#FF453A]",
        blue:   "text-[#028aa4]",
        gray:   "text-gray-500",
    };
    return (
        <div className="flex flex-col gap-1 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] px-5 py-4 flex-1 min-w-[140px] hover:bg-[#111] transition-colors">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${textColors[color]}`}>
                {icon}
                {label}
            </div>
            <span className="text-xl font-bold leading-none text-white mt-2 font-mono tabular-nums">{value}</span>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function OperacoesPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string; agencia?: string; categoria?: string; search?: string; }>; }) {
    const p = await searchParams;
    const currentMonth = p.month ?? new Date().toISOString().slice(0, 7);
    const statusFilter = (p.status ?? "").toLowerCase();
    const agenciaFilter = p.agencia ?? "";
    const categoriaFilter = p.categoria ?? "";
    const searchFilter = (p.search ?? "").toLowerCase().trim();
    const todayStr = toDateStr(new Date());

    const [y, mo] = currentMonth.split("-").map(Number);
    const monthLabel = new Date(currentMonth + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
    
    // Config dates
    const prevDate = new Date(y, mo - 2, 1);
    const nextDate = new Date(y, mo, 1);
    const startDate = `${currentMonth}-01`;
    const endDate = `${currentMonth}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;

    const buildMonthUrl = (m: string) => {
        const qs = new URLSearchParams();
        qs.set("month", m);
        if (p.status) qs.set("status", p.status);
        if (p.agencia) qs.set("agencia", p.agencia);
        if (p.categoria) qs.set("categoria", p.categoria);
        if (p.search) qs.set("search", p.search);
        return `?${qs.toString()}`;
    };
    
    const prevMonthUrl = buildMonthUrl(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`);
    const nextMonthUrl = buildMonthUrl(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`);

    // ── Enforce Database Truth for Statuses ──
    await syncFinanceStatuses(supabaseAdmin);

    const { data: rawData } = await supabaseAdmin
        .from("parcelas")
        .select(`
            id, contrato_id, valor_previsto, valor_bruto, data_vencimento, status_manual_override, observacao, deleted_at, categoria, numero_referencia, sub_indice, juros_aplicado,
            contratos(deleted_at, agencia_id, tipo_contrato, parcelas_total, forma_pagamento, imposto_percentual, dim_agencias(nome), clientes(id, nome_cliente, empresa_label, status_cliente, link_asana, deleted_at)),
            pagamentos(valor_pago, taxa_gateway, plataforma, status_pagamento)
        `)
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lte("data_vencimento", endDate)
        .order("data_vencimento", { ascending: true });

    const allParcelas = (rawData ?? []) as unknown as RawParcela[];
    
    const classified: Row[] = allParcelas
        .filter((rowP) => !rowP.deleted_at && !(rowP.contratos as any)?.deleted_at && !(rowP.contratos as any)?.clientes?.deleted_at && !["RENOVAR CONTRATO", "FINALIZAR PROJETO", "QUEBRA DE CONTRATO", "RENOVADO"].includes(rowP.status_manual_override ?? ""))
        .map((rowP): Row => {
            const dl = daysLate(rowP.data_vencimento, todayStr);
            const s = rowP.status_manual_override ?? "A_RECEBER";
            const ct = rowP.contratos as any;
            const rawAgencia = ct?.dim_agencias;
            const agenciaNome: string | null = rawAgencia ? (Array.isArray(rawAgencia) ? (rawAgencia[0]?.nome ?? null) : (rawAgencia.nome ?? null)) : null;
            const pagamentoRaw = rowP.pagamentos;
            const pagamento: RawPagamento | null = Array.isArray(pagamentoRaw) ? (pagamentoRaw[0] ?? null) : (pagamentoRaw ?? null);

            let rowStatus: RowStatus = "A_RECEBER";
            if (s === "PAGO" || s === "INADIMPLENTE RECEBIDO") rowStatus = "PAGO";
            else if (s === "INADIMPLENTE" || s === "PERDA DE FATURAMENTO") rowStatus = "INADIMPLENTE";
            else if (s === "EM_INADIMPLENCIA" || s === "EM_PERDA_FATURAMENTO") rowStatus = "EM_INADIMPLENCIA";
            else if (s === "ATRASADO") rowStatus = "ATRASADO";
            else if (s === "NORMAL" && rowP.data_vencimento === todayStr) rowStatus = "VENCE_HOJE";

            return { ...rowP, rowStatus, daysLateVal: Math.max(0, dl), agenciaNome, pagamento };
        });

    const agencias = [...new Set(classified.map(r => r.agenciaNome).filter(Boolean) as string[])].sort();
    const categorias = [...new Set(classified.map(r => r.categoria).filter(Boolean) as string[])].sort();

    const visible = classified.filter((row) => {
        if (statusFilter) {
            if (statusFilter === "pagos" && row.rowStatus !== "PAGO") return false;
            if (statusFilter === "a_receber" && row.rowStatus !== "A_RECEBER") return false;
            if (statusFilter === "vence_hoje" && row.rowStatus !== "VENCE_HOJE") return false;
            if (statusFilter === "atrasados" && row.rowStatus !== "ATRASADO") return false;
            if (statusFilter === "inadimplentes" && !["INADIMPLENTE", "PERDA", "EM_INADIMPLENCIA"].includes(row.rowStatus)) return false;
        }
        if (agenciaFilter && row.agenciaNome !== agenciaFilter) return false;
        if (categoriaFilter && row.categoria !== categoriaFilter) return false;
        if (searchFilter) {
            const ct = row.contratos as any;
            const nome = (ct?.clientes?.nome_cliente ?? "").toLowerCase();
            const emp = (ct?.clientes?.empresa_label ?? "").toLowerCase();
            if (!nome.includes(searchFilter) && !emp.includes(searchFilter)) return false;
        }
        return true;
    });

    const kpiCount = visible.length;
    const kpiTotalPrevisto = visible.reduce((s, r) => s + r.valor_previsto, 0);
    const kpiFaturadoLiquido = visible.reduce((s, r) => s + (r.pagamento?.valor_pago ?? 0), 0);
    const kpiTaxas = visible.reduce((s, r) => s + (r.pagamento?.taxa_gateway ?? 0), 0);
    const kpiAReceber = visible.filter(r => r.rowStatus !== "PAGO").reduce((s, r) => s + r.valor_previsto, 0);

    const TH = "py-2.5 px-1 text-left text-[9px] font-semibold text-gray-500 uppercase tracking-widest truncate select-none";
    const TD = "py-2.5 px-1 text-[10px] md:text-[11px] truncate whitespace-nowrap";

    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-10">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-[10px]">
                <Link href="/" className="text-gray-500 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-700">/</span>
                <Link href="/contas-a-receber" className="text-gray-500 hover:text-white transition-colors">Contas à Receber</Link>
                <span className="text-gray-700">/</span>
                <span className="text-[#ffa300] font-semibold">Mesa de Operações</span>
            </nav>

            {/* ── Date Navigator ── */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight leading-none mb-1">Mesa de Operações</h1>
                    <p className="text-[10px] text-gray-500 font-medium">Controle financeiro e recebíveis</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Minimalist Tabs */}
                    <div className="flex bg-[#111] border border-white/5 rounded-full p-1 h-9">
                        <span className="px-4 py-1 text-[11px] font-semibold rounded-full bg-white/10 text-white shadow-sm flex items-center justify-center cursor-default">
                            Mensal
                        </span>
                        <Link 
                            href={`/contas-a-receber/previsao?period=annual&date=${y}-01`} 
                            className="px-4 py-1 text-[11px] font-medium rounded-full text-gray-500 hover:text-white transition-all flex items-center justify-center"
                        >
                            Anual
                        </Link>
                    </div>

                    {/* Compact Date Navigator */}
                    <div className="flex items-center gap-1 bg-[#1C1C1E] border border-white/5 rounded-xl p-1 shadow-sm h-9">
                        <Link
                            href={prevMonthUrl}
                            className="w-6 h-full flex items-center justify-center rounded-md text-gray-500 hover:bg-white/5 hover:text-white transition-all"
                            aria-label="Mês anterior"
                        >
                            <ChevronLeft size={14} />
                        </Link>

                        <form method="GET" className="flex items-center gap-1.5 h-full">
                        {p.status && <input type="hidden" name="status" value={p.status} />}
                        {p.agencia && <input type="hidden" name="agencia" value={p.agencia} />}
                        {p.categoria && <input type="hidden" name="categoria" value={p.categoria} />}
                        {p.search && <input type="hidden" name="search" value={p.search} />}
                        <input 
                            type="month" 
                            name="month" 
                            defaultValue={currentMonth} 
                            className="bg-black border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-[#ffa300] [color-scheme:dark]" 
                        />
                        <button type="submit" className="bg-[#ffa300] text-black px-3 py-1.5 rounded-md text-[11px] font-bold hover:bg-orange-400 transition-colors">
                            Ir
                        </button>
                    </form>

                        <Link
                            href={nextMonthUrl}
                            className="w-6 h-full flex items-center justify-center rounded-md text-gray-500 hover:bg-white/5 hover:text-white transition-all"
                            aria-label="Próximo mês"
                        >
                            <ChevronRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard icon={<Users size={12} />} label="Contas" value={`${kpiCount}`} color="gray" />
                <KpiCard icon={<TrendingUp size={12} />} label="Previsto" value={brl(kpiTotalPrevisto)} color="orange" />
                <KpiCard icon={<Landmark size={12} />} label="Recebido" value={brl(kpiFaturadoLiquido)} color="green" />
                <KpiCard icon={<ArrowDownCircle size={12} />} label="Taxas" value={brl(kpiTaxas)} color="red" />
                <KpiCard icon={<Wallet size={12} />} label="A Receber" value={brl(kpiAReceber)} color="blue" />
            </div>

            {/* Tabela Principal */}
            <div className="rounded-2xl bg-[#0A0A0A] border border-[#222] shadow-2xl overflow-hidden mt-2 flex flex-col">
                <OperacoesToolbar
                    agencias={agencias}
                    categorias={categorias}
                    status={statusFilter}
                    agencia={agenciaFilter}
                    categoria={categoriaFilter}
                    search={searchFilter}
                />
                
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <span className="text-4xl opacity-30">📭</span>
                        <span className="text-sm font-medium text-gray-500">Nenhuma parcela no filtro</span>
                    </div>
                ) : (
                    <div className="w-full">
                        <table className="w-full table-fixed text-left text-[10px] md:text-[11px]">
                            <thead className="sticky top-0 z-10 backdrop-blur-xl">
                                <tr className="border-b border-[#222] bg-[#0A0A0A]/95">
                                    <th className={`${TH} w-[7%] pl-4`}>Cliente</th>
                                    <th className={`${TH} w-[9%]`}>Categoria</th>
                                    <th className={`${TH} w-[18%]`}>Cliente / Empresa</th>
                                    <th className={`${TH} w-[8%]`}>Agência</th>
                                    <th className={`${TH} w-[8%]`}>Vencimento</th>
                                    <th className={`${TH} w-[9%]`}>Status</th>
                                    <th className={`${TH} w-[5%]`}>Parcela</th>
                                    <th className={`${TH} w-[10%] text-right`}>Valor Bruto</th>
                                    <th className={`${TH} w-[10%] text-right`}>Recebido</th>
                                    <th className={`${TH} w-[6%]`}>Plataforma</th>
                                    <th className={`${TH} w-[10%] text-right pr-4`}>Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {visible.map((row) => {
                                    const ct = row.contratos as any;
                                    const cliente = ct?.clientes as RawCliente | null;
                                    const clienteId = cliente?.id ?? null;
                                    const isPago = row.rowStatus === "PAGO";
                                    const linkAsana = cliente?.link_asana;
                                    
                                    const parcelaRef = (() => {
                                        const nr = row.numero_referencia;
                                        const total = ct?.parcelas_total;
                                        if (!nr) return "—";
                                        return total ? `${nr}/${total}` : `${nr}`;
                                    })();

                                    const parcelaData: ParcelaForActions = {
                                        id: row.id,
                                        valor_previsto: row.valor_previsto,
                                        valor_bruto: row.valor_bruto ?? undefined,
                                        imposto_percentual: (ct?.imposto_percentual as number | null) ?? undefined,
                                        status_manual_override: row.status_manual_override,
                                        numero_referencia: row.numero_referencia ?? undefined,
                                        sub_indice: row.sub_indice ?? undefined,
                                        forma_pagamento_contrato: ct?.forma_pagamento ?? undefined,
                                        data_vencimento: row.data_vencimento,
                                        hasPagamento: isPago,
                                        contrato_id: row.contrato_id ?? null,
                                        cliente_id: clienteId,
                                    };

                                    return (
                                        <tr
                                            key={row.id}
                                            className={`group transition-colors hover:bg-white/[0.025] border-b border-[#1a1a1a] last:border-0 ${
                                                isPago ? "opacity-40 hover:opacity-60" : ""
                                            }`}
                                        >
                                            {/* STATUS CLIENTE */}
                                            <td className={`${TD} pl-4`}>
                                                <ClienteBadge status={cliente?.status_cliente} />
                                            </td>

                                            {/* CATEGORIA */}
                                            <td className={`${TD} text-gray-500 font-medium`}>
                                                {row.categoria ?? "—"}
                                            </td>

                                            {/* CLIENTE / EMPRESA */}
                                            <td className={TD}>
                                                {clienteId ? (
                                                    <div className="flex flex-col truncate pr-2">
                                                        <Link
                                                            href={`/cliente/${clienteId}`}
                                                            className="font-semibold text-white truncate hover:text-[#ffa300] transition-colors"
                                                        >
                                                            {cliente?.nome_cliente ?? "—"}
                                                        </Link>
                                                        {(cliente?.empresa_label || linkAsana) && (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                                                <span className="truncate">{cliente?.empresa_label}</span>
                                                                {linkAsana && (
                                                                    <a
                                                                        href={linkAsana}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-500 hover:text-blue-300 shrink-0"
                                                                        title="Abrir no Asana"
                                                                    >
                                                                        <ExternalLink size={9} />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                        {!cliente?.empresa_label && linkAsana && (
                                                            <a
                                                                href={linkAsana}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-0.5 text-[9px] text-purple-500 hover:text-purple-300 transition-colors mt-0.5"
                                                                title="Abrir no Asana"
                                                            >
                                                                <ExternalLink size={8} /> Asana
                                                            </a>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600 truncate">Desconhecido</span>
                                                )}
                                            </td>

                                            {/* AGÊNCIA */}
                                            <td className={`${TD} text-gray-500 truncate pr-2`}>
                                                {row.agenciaNome ?? "—"}
                                            </td>

                                            {/* VENCIMENTO */}
                                            <td className={`${TD} font-mono tabular-nums ${
                                                isPago ? "text-gray-600" : "text-gray-300"
                                            }`}>
                                                {fmtDate(row.data_vencimento)}
                                            </td>

                                            {/* STATUS BADGE */}
                                            <td className={TD}>
                                                <StatusPill row={row} />
                                            </td>

                                            {/* PARCELA FRAÇÃO */}
                                            <td className={`${TD} font-mono tabular-nums text-gray-600`}>
                                                {parcelaRef}
                                            </td>

                                            {/* VALOR BRUTO */}
                                            <td className={`${TD} text-right font-mono tabular-nums font-medium text-white`}>
                                                {brl(row.valor_bruto ?? row.valor_previsto)}
                                            </td>

                                            {/* VALOR RECEBIDO */}
                                            <td className={`${TD} text-right font-mono tabular-nums font-medium ${
                                                isPago ? "text-[#34C759]" : "text-gray-700"
                                            }`}>
                                                {isPago ? brl(row.pagamento?.valor_pago ?? 0) : "—"}
                                            </td>

                                            {/* PLATAFORMA — shows actual payment platform or dash */}
                                            <td className={`${TD} text-[9px] uppercase tracking-wider truncate ${
                                                isPago && row.pagamento?.plataforma ? "text-gray-400" : "text-gray-700"
                                            }`}>
                                                {isPago ? (row.pagamento?.plataforma ?? "—") : "—"}
                                            </td>

                                            {/* AÇÃO */}
                                            <td className={`${TD} text-right pr-4 overflow-visible`}>
                                                <ParcelaActions parcela={parcelaData} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-[#222] bg-[#050505]">
                                    <td colSpan={7} className="pl-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                                        Total do filtro &middot; {visible.length} parcelas
                                    </td>
                                    <td className="px-1 py-3 text-right font-mono tabular-nums font-bold text-white text-[11px]">
                                        {brl(kpiTotalPrevisto)}
                                    </td>
                                    <td className="px-1 py-3 text-right font-mono tabular-nums font-bold text-[#34C759] text-[11px]">
                                        {kpiFaturadoLiquido > 0 ? brl(kpiFaturadoLiquido) : "—"}
                                    </td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}