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
import { getRiskStatus, getContratosSujos } from "@/lib/financeRules";
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

// ─── Status Pill Minimalista (Apple Style) ────────────────────────────────────
function StatusPill({ row }: { row: Row }) {
    const map: Record<RowStatus, string> = {
        PAGO: "text-green-500 bg-green-500/10",
        INADIMPLENTE: "text-red-500 bg-red-500/10",
        PERDA: "text-red-500 bg-red-500/10",
        EM_INADIMPLENCIA: "text-red-500 bg-red-500/10",
        ATRASADO: "text-yellow-500 bg-yellow-500/10",
        VENCE_HOJE: "text-cyan-500 bg-cyan-500/10",
        A_RECEBER: "text-gray-400 bg-gray-500/10",
    };
    const labels: Record<RowStatus, string> = {
        PAGO: "Pago",
        INADIMPLENTE: "Inadimplente",
        PERDA: "Perda",
        EM_INADIMPLENCIA: "Em Inadimplência",
        ATRASADO: "Atrasado",
        VENCE_HOJE: "Vence Hoje",
        A_RECEBER: "A Receber",
    };
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-semibold whitespace-nowrap ${map[row.rowStatus]}`}>
            {labels[row.rowStatus]}
        </span>
    );
}

function ClienteBadge({ status }: { status: string | null | undefined }) {
    if (!status) return <span className="text-gray-600">—</span>;
    const ok = status === "ATIVO";
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap ${ok ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
            {status}
        </span>
    );
}

// ─── KPI Card Minimalista ────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = "orange" }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: "orange" | "green" | "red" | "blue" | "gray"; }) {
    const borders = {
        orange: "border-orange-500/20",
        green: "border-emerald-500/20",
        red: "border-rose-500/30",
        blue: "border-sky-500/20",
        gray: "border-white/10",
    };
    const textColors = {
        orange: "text-orange-400",
        green: "text-emerald-400",
        red: "text-rose-400",
        blue: "text-sky-400",
        gray: "text-gray-400",
    };
    return (
        <div className={`flex flex-col gap-1 rounded-2xl bg-white/[0.02] backdrop-blur-2xl border ${borders[color]} px-6 py-5 flex-1 min-w-[160px]`}>
            <div className={`flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-widest ${textColors[color]}`}>
                {icon}
                {label}
            </div>
            <span className="text-2xl font-semibold leading-none text-white mt-1.5">{value}</span>
            {sub && <span className="text-[9px] text-gray-500 mt-1">{sub}</span>}
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

    const prevDate = new Date(y, mo - 2, 1);
    const prevMonthUrlStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    
    const nextDate = new Date(y, mo, 1);
    const nextMonthUrlStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

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
    const contratosSujos = getContratosSujos(allParcelas, todayStr);

    const classified: Row[] = allParcelas
        .filter((rowP) => !rowP.deleted_at && !(rowP.contratos as any)?.deleted_at && !(rowP.contratos as any)?.clientes?.deleted_at && !["RENOVAR CONTRATO", "FINALIZAR PROJETO", "QUEBRA DE CONTRATO", "RENOVADO"].includes(rowP.status_manual_override ?? ""))
        .map((rowP): Row => {
            const dl = daysLate(rowP.data_vencimento, todayStr);
            const risk = getRiskStatus(dl);
            const s = rowP.status_manual_override ?? "";
            const ct = rowP.contratos as any;
            const rawAgencia = ct?.dim_agencias;
            const agenciaNome: string | null = rawAgencia ? (Array.isArray(rawAgencia) ? (rawAgencia[0]?.nome ?? null) : (rawAgencia.nome ?? null)) : null;
            const pagamentoRaw = rowP.pagamentos;
            const pagamento: RawPagamento | null = Array.isArray(pagamentoRaw) ? (pagamentoRaw[0] ?? null) : (pagamentoRaw ?? null);

            let rowStatus: RowStatus = "A_RECEBER";
            if (s === "PAGO" || s === "INADIMPLENTE RECEBIDO") rowStatus = "PAGO";
            else if (s === "INADIMPLENTE" || s === "PERDA DE FATURAMENTO") rowStatus = risk === "PERDA" ? "PERDA" : "INADIMPLENTE";
            else if (s === "POSSUI INADIMPLENCIA" || (s === "NORMAL" && rowP.contrato_id && contratosSujos.has(rowP.contrato_id) && dl <= 0)) rowStatus = "EM_INADIMPLENCIA";
            else if (risk === "PERDA") rowStatus = "PERDA";
            else if (risk === "INADIMPLENTE") rowStatus = "INADIMPLENTE";
            else if (risk === "ATRASO") rowStatus = "ATRASADO";
            else if (rowP.data_vencimento === todayStr) rowStatus = "VENCE_HOJE";

            if (rowStatus === "INADIMPLENTE" || rowStatus === "EM_INADIMPLENCIA") {
                if (ct?.clientes) {
                    ct.clientes.status_cliente = "INADIMPLENTE";
                }
            }

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

    const TH = "px-3 py-3 text-left text-[10px] font-medium text-gray-500 uppercase tracking-widest whitespace-nowrap select-none";
    const TD = "px-3 py-3 whitespace-nowrap";

    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-10">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-[10px]">
                <Link href="/" className="text-gray-500 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-700">/</span>
                <Link href="/contas-a-receber" className="text-gray-500 hover:text-white transition-colors">Contas à Receber</Link>
                <span className="text-gray-700">/</span>
                <span className="text-orange-500 font-semibold">Mesa de Operações</span>
            </nav>

            {/* Header / Configuração e Navegação de Data mudaram para dentro do OperacoesToolbar (via props ou client component if needed) */}
            {/* Como é Server Component, vamos passar esses dados para o Toolbar */}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard icon={<Users size={10} />} label="Contas" value={`${kpiCount}`} color="gray" />
                <KpiCard icon={<TrendingUp size={10} />} label="Previsto" value={brl(kpiTotalPrevisto)} color="orange" />
                <KpiCard icon={<Landmark size={10} />} label="Recebido" value={brl(kpiFaturadoLiquido)} color="green" />
                <KpiCard icon={<ArrowDownCircle size={10} />} label="Taxas" value={brl(kpiTaxas)} color="red" />
                <KpiCard icon={<Wallet size={10} />} label="A Receber" value={brl(kpiAReceber)} color="blue" />
            </div>

            {/* Tabela Principal */}
            <div className="rounded-3xl bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] overflow-hidden mt-2">
                <OperacoesToolbar
                    agencias={agencias}
                    categorias={categorias}
                    status={statusFilter}
                    agencia={agenciaFilter}
                    categoria={categoriaFilter}
                    search={searchFilter}
                    currentMonth={currentMonth}
                    monthLabelCap={monthLabelCap}
                    year={y}
                />
                
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <span className="text-4xl opacity-50">📭</span>
                        <span className="text-sm font-medium text-gray-500">Nenhuma parcela para este filtro</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]" style={{ minWidth: "1200px" }}>
                            <thead>
                                <tr className="border-b border-white/5 bg-[#111]">
                                    <th className={TH}>St. Cliente</th>
                                    <th className={TH}>Categoria</th>
                                    <th className={`${TH} min-w-[180px]`}>Cliente / Empresa</th>
                                    <th className={TH}>Agência</th>
                                    <th className={TH}>Vencimento</th>
                                    <th className={TH}>Status</th>
                                    <th className={`${TH} text-right`}>Atraso</th>
                                    <th className={`${TH} text-center`}>Parcela</th>
                                    <th className={`${TH} text-right`}>Valor Prev.</th>
                                    <th className={`${TH} text-right`}>Pago (Líq)</th>
                                    <th className={TH}>Plataforma</th>
                                    <th className={`${TH} text-right min-w-[180px] w-[180px]`}>Ação</th>
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
                                        forma_pagamento_contrato: ct?.forma_pagamento ?? undefined,
                                        data_vencimento: row.data_vencimento,
                                        hasPagamento: isPago,
                                        contrato_id: row.contrato_id ?? null,
                                        cliente_id: clienteId,
                                    };

                                    return (
                                        <tr key={row.id} className={`group transition-colors bg-transparent hover:bg-white/[0.03] ${isPago ? "opacity-50" : ""}`}>
                                            <td className={TD}><ClienteBadge status={cliente?.status_cliente} /></td>
                                            <td className={`${TD} text-gray-400 font-medium`}>{row.categoria ?? "—"}</td>
                                            <td className={TD}>
                                                {clienteId ? (
                                                    <div className="flex flex-col gap-0.5">
                                                        <Link href={`/cliente/${clienteId}`} className="font-semibold text-white truncate max-w-[200px] hover:text-orange-400 transition-colors">
                                                            {cliente.nome_cliente ?? "—"}
                                                        </Link>
                                                        {(cliente.empresa_label || linkAsana) && (
                                                            <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                                                                <span className="truncate max-w-[150px]">{cliente.empresa_label}</span>
                                                                {linkAsana && (
                                                                    <a href={linkAsana} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title="Abrir no Asana">
                                                                        <ExternalLink size={10} />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : <span className="text-gray-500">Desconhecido</span>}
                                            </td>
                                            <td className={`${TD} text-gray-400`}>{row.agenciaNome ?? "—"}</td>
                                            <td className={`${TD} font-mono ${isPago ? "line-through text-gray-500" : "text-gray-300"}`}>{fmtDate(row.data_vencimento)}</td>
                                            <td className={TD}><StatusPill row={row} /></td>
                                            <td className={`${TD} text-right font-mono ${row.daysLateVal > 0 ? "text-red-400 font-medium" : "text-gray-600"}`}>{row.daysLateVal > 0 ? `${row.daysLateVal}d` : "—"}</td>
                                            <td className={`${TD} text-center font-mono text-gray-500`}>{parcelaRef}</td>
                                            <td className={`${TD} text-right font-medium text-white`}>{brl(row.valor_previsto)}</td>
                                            <td className={`${TD} text-right font-medium ${isPago ? "text-green-400" : "text-gray-600"}`}>{isPago ? brl(row.pagamento?.valor_pago || 0) : "—"}</td>
                                            <td className={`${TD} text-gray-500`}>{isPago ? row.pagamento?.plataforma : "—"}</td>
                                            <td className={`${TD} text-right`}><ParcelaActions parcela={parcelaData} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-white/10 bg-white/[0.01]">
                                    <td colSpan={8} className="px-3 py-4 text-[9px] text-gray-600 uppercase tracking-widest font-bold">
                                        {visible.length} parcelas · {monthLabelCap}
                                    </td>
                                    <td className="px-3 py-4 text-right font-black text-white text-xs whitespace-nowrap">
                                        {brl(kpiTotalPrevisto)}
                                    </td>
                                    <td className="px-3 py-4 text-right font-black text-green-400 text-xs whitespace-nowrap">
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