import Link from "next/link";
import {
    ArrowLeft,
    Calendar,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    FileText,
    CheckCircle2,
    Clock,
    AlertTriangle,
    ListFilter,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, daysLate, toDateStr } from "@/lib/utils";
import { isParcelaValidaParaPrevisao } from "@/lib/financeRules";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawParcela {
    id: string;
    valor_previsto: number;
    data_vencimento: string;
    status_manual_override: string;
    deleted_at?: string | null;
    observacao?: string | null;
    contratos?: {
        deleted_at?: string | null;
        clientes?: {
            id?: string | null;
            nome_cliente?: string | null;
            deleted_at?: string | null;
        } | null;
    } | null;
}

type Category = "pagos" | "atrasados" | "proximos" | "abertos";

interface Classified extends RawParcela {
    category: Category;
    daysLateVal: number;
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ item }: { item: Classified }) {
    if (item.category === "pagos")
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border bg-green-500/15 text-green-400 border-green-500/30">
                <CheckCircle2 size={9} /> Pago
            </span>
        );
    if (item.category === "atrasados")
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border bg-red-500/15 text-red-400 border-red-500/30">
                <AlertTriangle size={9} /> {item.daysLateVal}d atraso
            </span>
        );
    if (item.category === "proximos")
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border bg-orange-500/15 text-orange-400 border-orange-500/30">
                <Clock size={9} /> Vence em breve
            </span>
        );
    return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border bg-white/10 text-gray-400 border-white/20">
            A receber
        </span>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function ListaRecebimentosMes({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; filter?: string }>;
}) {
    const params = await searchParams;
    const currentMonth = params.month ?? new Date().toISOString().slice(0, 7);
    const filter = (params.filter ?? "todos").toLowerCase();
    const todayStr = toDateStr(new Date());

    // ── Month label ────────────────────────────────────────────────────────────
    const monthLabel = new Date(currentMonth + "-01T12:00:00").toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
    });
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    // ── Adjacent months for navigation ────────────────────────────────────────
    const [y, m] = currentMonth.split("-").map(Number);
    const prevMonthStr = (() => {
        const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const nextMonthStr = (() => {
        const d = new Date(y, m, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();

    // ── DB query — date range to avoid .like() on date columns ────────────────
    const startDate = `${currentMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

    const { data, error } = await supabaseAdmin
        .from("parcelas")
        .select("id, valor_previsto, data_vencimento, status_manual_override, observacao, deleted_at, contratos(deleted_at, clientes(id, nome_cliente, deleted_at))")
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lte("data_vencimento", endDate)
        .order("data_vencimento", { ascending: true });

    if (error) {
        console.error("[ListaRecebimentosMes] Supabase error:", error.message);
    }

    // Filter cascade-deleted parents before classification
    const raw: RawParcela[] = ((data ?? []) as RawParcela[]).filter(
        (p) => isParcelaValidaParaPrevisao(p, todayStr)
    );

    // ── Classify each parcela ─────────────────────────────────────────────────
    const classified: Classified[] = raw.map((p) => {
        const dl = daysLate(p.data_vencimento, todayStr);
        let category: Category;
        if (p.status_manual_override === "PAGO") {
            category = "pagos";
        } else if (dl > 0) {
            category = "atrasados";
        } else if (dl >= -3) {
            category = "proximos";  // due today or within next 3 days
        } else {
            category = "abertos";
        }
        return { ...p, category, daysLateVal: dl };
    });

    // ── Counts & totals per category ──────────────────────────────────────────
    const stats = {
        todos: { count: classified.length, total: classified.reduce((s, p) => s + p.valor_previsto, 0) },
        atrasados: { count: classified.filter(p => p.category === "atrasados").length, total: classified.filter(p => p.category === "atrasados").reduce((s, p) => s + p.valor_previsto, 0) },
        proximos: { count: classified.filter(p => p.category === "proximos").length, total: classified.filter(p => p.category === "proximos").reduce((s, p) => s + p.valor_previsto, 0) },
        abertos: { count: classified.filter(p => p.category === "abertos").length, total: classified.filter(p => p.category === "abertos").reduce((s, p) => s + p.valor_previsto, 0) },
        pagos: { count: classified.filter(p => p.category === "pagos").length, total: classified.filter(p => p.category === "pagos").reduce((s, p) => s + p.valor_previsto, 0) },
    };

    // ── Apply filter ──────────────────────────────────────────────────────────
    const visible =
        filter === "todos" ? classified :
            filter === "atrasados" ? classified.filter(p => p.category === "atrasados") :
                filter === "proximos" ? classified.filter(p => p.category === "proximos") :
                    filter === "abertos" ? classified.filter(p => p.category === "abertos") :
                        filter === "pagos" ? classified.filter(p => p.category === "pagos") :
                            classified;

    const totalVisible = visible.reduce((s, p) => s + p.valor_previsto, 0);

    // ── Filter tab config ──────────────────────────────────────────────────────
    const tabs: {
        key: string;
        label: string;
        icon: React.ReactNode;
        activeClass: string;
        inactiveClass: string;
    }[] = [
            {
                key: "todos",
                label: `Todos (${stats.todos.count})`,
                icon: <ListFilter size={11} />,
                activeClass: "bg-white/15 text-white border-white/30",
                inactiveClass: "text-gray-500 border-white/10 hover:border-white/20 hover:text-gray-300",
            },
            {
                key: "atrasados",
                label: `Em Atraso (${stats.atrasados.count})`,
                icon: <AlertTriangle size={11} />,
                activeClass: "bg-red-500/20 text-red-400 border-red-500/40",
                inactiveClass: "text-gray-500 border-white/10 hover:border-red-500/30 hover:text-red-400",
            },
            {
                key: "proximos",
                label: `Vence em Breve (${stats.proximos.count})`,
                icon: <Clock size={11} />,
                activeClass: "bg-orange-500/20 text-orange-400 border-orange-500/40",
                inactiveClass: "text-gray-500 border-white/10 hover:border-orange-500/30 hover:text-orange-400",
            },
            {
                key: "abertos",
                label: `Abertos (${stats.abertos.count})`,
                icon: <TrendingUp size={11} />,
                activeClass: "bg-blue-500/20 text-blue-400 border-blue-500/40",
                inactiveClass: "text-gray-500 border-white/10 hover:border-blue-500/30 hover:text-blue-400",
            },
            {
                key: "pagos",
                label: `Pagos (${stats.pagos.count})`,
                icon: <CheckCircle2 size={11} />,
                activeClass: "bg-green-500/20 text-green-400 border-green-500/40",
                inactiveClass: "text-gray-500 border-white/10 hover:border-green-500/30 hover:text-green-400",
            },
        ];

    return (
        <div className="flex flex-col gap-8 max-w-7xl mx-auto">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
                <span className="text-gray-600">/</span>
                <Link href="/contas-a-receber" className="text-gray-400 hover:text-white transition-colors">Contas à receber</Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Visão Geral do Mês</span>
            </nav>

            {/* Back button */}
            <Link
                href="/contas-a-receber"
                className="self-start flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500 text-gray-400 hover:text-orange-400 px-4 py-2 text-xs font-medium transition-all"
            >
                <ArrowLeft size={14} />
                Voltar para painel
            </Link>

            {/* Hero Card */}
            <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl p-8 shadow-[0_0_40px_rgba(249,115,22,0.08)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">

                    {/* Left — title + month nav */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-orange-500">
                            <Calendar size={18} />
                            <span className="text-xs font-semibold uppercase tracking-widest">Recebimentos mensais</span>
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight">{monthLabelCap}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <Link
                                href={`?month=${prevMonthStr}&filter=${filter}`}
                                className="text-[10px] font-medium text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/50 rounded-lg px-2.5 py-1 transition-all"
                            >
                                ← Mês anterior
                            </Link>
                            <Link
                                href={`?month=${nextMonthStr}&filter=${filter}`}
                                className="text-[10px] font-medium text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/50 rounded-lg px-2.5 py-1 transition-all"
                            >
                                Próximo mês →
                            </Link>
                        </div>
                    </div>

                    {/* Right — KPI grid */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col items-center rounded-2xl bg-orange-500/10 border border-orange-500/20 px-6 py-4 gap-0.5">
                            <span className="text-[9px] text-orange-400/70 uppercase tracking-widest font-semibold">Total previsto</span>
                            <span className="text-2xl font-black text-orange-500 leading-none">{brl(stats.todos.total)}</span>
                            <span className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                                <TrendingUp size={9} /> {stats.todos.count} parcelas
                            </span>
                        </div>
                        {stats.atrasados.count > 0 && (
                            <div className="flex flex-col items-center rounded-2xl bg-red-500/10 border border-red-500/20 px-6 py-4 gap-0.5">
                                <span className="text-[9px] text-red-400/70 uppercase tracking-widest font-semibold">Em atraso</span>
                                <span className="text-2xl font-black text-red-400 leading-none">{brl(stats.atrasados.total)}</span>
                                <span className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                                    <TrendingDown size={9} /> {stats.atrasados.count} parcelas
                                </span>
                            </div>
                        )}
                        {stats.pagos.count > 0 && (
                            <div className="flex flex-col items-center rounded-2xl bg-green-500/10 border border-green-500/20 px-6 py-4 gap-0.5">
                                <span className="text-[9px] text-green-400/70 uppercase tracking-widest font-semibold">Recebido</span>
                                <span className="text-2xl font-black text-green-400 leading-none">{brl(stats.pagos.total)}</span>
                                <span className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5">
                                    <CheckCircle2 size={9} /> {stats.pagos.count} parcelas
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Table Card */}
            <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">

                {/* Card header + filter tabs */}
                <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <FileText size={15} className="text-orange-500" />
                        <h2 className="text-sm font-bold text-white">
                            Parcelas — <span className="text-orange-500">{monthLabelCap}</span>
                        </h2>
                    </div>

                    {/* Filter tabs */}
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => {
                            const isActive = filter === tab.key;
                            return (
                                <Link
                                    key={tab.key}
                                    href={`?month=${currentMonth}&filter=${tab.key}`}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${isActive ? tab.activeClass : tab.inactiveClass
                                        }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <span className="text-4xl">📭</span>
                        <span className="text-sm font-medium text-gray-500">Nenhuma parcela para este filtro</span>
                        <Link
                            href={`?month=${currentMonth}&filter=todos`}
                            className="text-[10px] text-orange-400 hover:underline"
                        >
                            Ver todos os recebimentos →
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/10">
                                    {["Data", "Cliente", "Observação", "Status", "Valor", ""].map((h) => (
                                        <th
                                            key={h}
                                            className="px-6 py-3 text-left text-[10px] font-bold text-orange-500 uppercase tracking-widest whitespace-nowrap"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {visible.map((p) => {
                                    const clientId = p.contratos?.clientes?.id;
                                    const nome = p.contratos?.clientes?.nome_cliente ?? "—";
                                    const href = clientId ? `/cliente/${clientId}` : "#";
                                    const isLate = p.category === "atrasados";
                                    const isProximo = p.category === "proximos";

                                    return (
                                        <tr
                                            key={p.id}
                                            className={`group border-b border-white/5 last:border-0 transition-colors ${isLate ? "hover:bg-red-500/5" :
                                                isProximo ? "hover:bg-orange-500/5" :
                                                    "hover:bg-white/5"
                                                }`}
                                        >
                                            {/* Data */}
                                            <td className={`px-6 py-4 whitespace-nowrap font-mono ${isLate ? "text-red-400" : isProximo ? "text-orange-300" : "text-gray-300"}`}>
                                                {fmtDate(p.data_vencimento)}
                                            </td>

                                            {/* Cliente */}
                                            <td className="px-6 py-4 min-w-[160px]">
                                                <Link
                                                    href={href}
                                                    className={`font-semibold hover:text-orange-400 transition-colors truncate block max-w-[200px] ${isLate ? "text-red-300" : isProximo ? "text-orange-200" : "text-white"
                                                        }`}
                                                >
                                                    {nome}
                                                </Link>
                                            </td>

                                            {/* Observação */}
                                            <td className="px-6 py-4 text-gray-400 max-w-[200px]">
                                                <span className="truncate block">{p.observacao ?? "—"}</span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusPill item={p} />
                                            </td>

                                            {/* Valor */}
                                            <td className={`px-6 py-4 whitespace-nowrap font-bold ${isLate ? "text-red-400" : isProximo ? "text-orange-400" : "text-white"}`}>
                                                {brl(p.valor_previsto)}
                                            </td>

                                            {/* Drill-down */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Link
                                                    href={href}
                                                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 group-hover:border-orange-500/50 group-hover:text-orange-400 text-gray-600 transition-all"
                                                >
                                                    <ChevronRight size={13} />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                            {/* Footer total */}
                            <tfoot>
                                <tr className="border-t border-white/10">
                                    <td colSpan={4} className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                                        {filter === "todos" ? "Total do mês" : `Total — ${tabs.find(t => t.key === filter)?.label}`}
                                    </td>
                                    <td className="px-6 py-4 font-black text-orange-500 text-sm whitespace-nowrap">
                                        {brl(totalVisible)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}
