import Link from "next/link";
import {
    Search,
    ChevronsUpDown,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Banknote,
    BookOpen,
    UserSearch,
    AlertTriangle,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import RecebimentosChart, { MonthlyParcela } from "@/components/RecebimentosChart";
import ActionCardButton from "@/components/ActionCardButton";
import { brl, toDateStr, daysLate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawParcela {
    id: string;
    contrato_id: string; // needed for cross-default grouping
    valor_previsto: number;
    data_vencimento: string; // "YYYY-MM-DD"
    status_manual_override: string;
    observacao?: string | null;
    contratos?: {
        clientes?: {
            id?: string | null;
            nome_cliente?: string | null;
        } | null;
    } | null;
}

// ─── Page (async Server Component) ───────────────────────────────────────────
export default async function ContasAReceberPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string; month?: string }>;
}) {
    const params = await searchParams;
    const todayStr = toDateStr(new Date());

    // currentDate: use ?date param (YYYY-MM-DD) or fall back to today
    const currentDate = params.date ?? todayStr;
    // currentMonth: use ?month param (YYYY-MM) or derive from currentDate
    const currentMonth = params.month ?? currentDate.slice(0, 7);

    // ── Prev / Next day navigation ─────────────────────────────────────────────
    const currDateObj = new Date(currentDate + "T12:00:00"); // T12 avoids timezone date shift

    const prevDateObj = new Date(currDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDateStr = prevDateObj.toISOString().split("T")[0];
    const prevMonthStr = prevDateStr.slice(0, 7);

    const nextDateObj = new Date(currDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = nextDateObj.toISOString().split("T")[0];
    const nextMonthStr = nextDateStr.slice(0, 7);

    // ── 1. Fetch parcelas with relational join ─────────────────────────────────
    const { data: parcelasData, error } = await supabaseAdmin
        .from("parcelas")
        .select("*, contratos(clientes(id, nome_cliente))")
        .eq("status_manual_override", "NORMAL")
        .order("data_vencimento", { ascending: true });

    if (error) {
        console.error("[ContasAReceber] Supabase error:", error.message);
    }

    const parcelas: RawParcela[] = (parcelasData ?? []) as RawParcela[];

    // ── 2. CONTRACT-LEVEL RISK ASSESSMENT (Cross-Default logic) ────────────────
    const contratoMap = new Map<string, RawParcela[]>();
    for (const p of parcelas) {
        const key = p.contrato_id ?? `solo-${p.id}`;
        if (!contratoMap.has(key)) contratoMap.set(key, []);
        contratoMap.get(key)!.push(p);
    }

    let totalAReceber = 0;
    let totalAtraso = 0;
    let totalInadimplencia = 0;
    let totalPerda = 0;

    for (const [, group] of contratoMap) {
        const contractBalance = group.reduce((s, p) => s + (p.valor_previsto ?? 0), 0);
        const maxLate = Math.max(...group.map((p) => daysLate(p.data_vencimento, todayStr)));

        if (maxLate > 30) totalPerda += contractBalance;
        else if (maxLate >= 15) totalInadimplencia += contractBalance;
        else if (maxLate >= 1) totalAtraso += contractBalance;
        else totalAReceber += contractBalance;
    }

    // ── 3. Selected-date agenda (LEFT column) ─────────────────────────────────
    const parcelasHoje = parcelas.filter((p) => p.data_vencimento === currentDate);
    const totalHoje = parcelasHoje.reduce((sum, p) => sum + (p.valor_previsto ?? 0), 0);

    const formattedSelectedDate = new Date(currentDate + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });

    const parcelasMes = parcelas.filter((p) => p.data_vencimento.startsWith(currentMonth));
    const totalCount = parcelasMes.length;
    const clientCount = new Set(
        parcelasMes
            .map((p) => p.contratos?.clientes?.id)
            .filter(Boolean)
    ).size;

    // ── 4. Monthly chart data ─────────────────────────────────────────────────
    const monthlyData: MonthlyParcela[] = parcelas
        .filter((p) => p.data_vencimento.startsWith(currentMonth))
        .map((p) => ({ data_vencimento: p.data_vencimento, valor_previsto: p.valor_previsto }));

    const previsaoMes = monthlyData.reduce((s, p) => s + p.valor_previsto, 0);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                    Dashboard
                </Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Contas à receber</span>
            </nav>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ════════════════════════════════════════
                    LEFT — List / Search (col-span-5)
                ════════════════════════════════════════ */}
                <div className="lg:col-span-5 flex flex-col rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-5 gap-4">

                    {/* Header — selected date */}
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold text-white leading-tight">
                                {parcelasHoje.length} Contas a receber
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                                Agenda — {formattedSelectedDate}
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-black">
                            +{brl(totalHoje)}
                        </span>
                    </div>

                    {/* Search + filter */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Buscar conta..."
                                className="w-full rounded-xl bg-white/5 border border-white/10 pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                            />
                        </div>
                        <button className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-gray-400 hover:border-orange-500 transition-colors shrink-0">
                            Selecionar filtro <ChevronsUpDown size={12} />
                        </button>
                    </div>

                    {/* Table */}
                    <div className="flex flex-col flex-1">
                        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-2 pb-2 border-b border-white/10">
                            <span className="text-[10px] font-semibold text-orange-500 uppercase flex items-center gap-1">
                                Cliente <ChevronsUpDown size={10} />
                            </span>
                            <span className="text-[10px] font-semibold text-orange-500 uppercase">Observação</span>
                            <span className="text-[10px] font-semibold text-orange-500 uppercase">Valor</span>
                            <span />
                        </div>

                        {/* Data rows — TODAY only */}
                        {parcelasHoje.length > 0 ? (
                            parcelasHoje.map((p) => {
                                const nome = p.contratos?.clientes?.nome_cliente ?? "Cliente Desconhecido";
                                const obs = p.observacao ?? "—";
                                return (
                                    <Link
                                        href={`/cliente/${p.contratos?.clientes?.id ?? ""}`}
                                        key={p.id}
                                        className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center px-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs text-white font-medium truncate">{nome}</span>
                                            <span className="text-[10px] text-orange-400/70">
                                                {currentDate === todayStr ? "Vence hoje" : `Vence ${currentDate.split("-").reverse().join("/")}`}
                                            </span>
                                        </div>
                                        <span className="text-xs text-orange-400 truncate">{obs}</span>
                                        <span className="text-xs text-white font-semibold whitespace-nowrap">
                                            {brl(p.valor_previsto)}
                                        </span>
                                        <ChevronRight size={14} className="text-gray-500" />
                                    </Link>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-600 text-xs gap-2">
                                <span className="text-2xl">📭</span>
                                <span>Nenhum recebimento para {currentDate === todayStr ? "hoje" : formattedSelectedDate}</span>
                                <span className="text-[10px] text-gray-700">Clique em outro dia no gráfico</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <Link 
                            href={`/contas-a-receber/lista?month=${currentMonth}`}
                            className="text-xs text-gray-400 hover:text-orange-500 transition-colors underline-offset-4 hover:underline"
                        >
                            Visualizar todos recebimentos
                        </Link>
                        <div className="flex gap-2">
                            <Link
                                href={`?date=${prevDateStr}&month=${prevMonthStr}`}
                                className="text-xs text-gray-500 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-orange-500/50 hover:text-orange-400"
                                scroll={false}
                            >
                                ← Anterior
                            </Link>
                            <Link
                                href={`?date=${nextDateStr}&month=${nextMonthStr}`}
                                className="text-xs text-gray-500 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-orange-500/50 hover:text-orange-400"
                                scroll={false}
                            >
                                Próximo →
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ════════════════════════════════════════
                    RIGHT — Metrics & Actions (col-span-7)
                ════════════════════════════════════════ */}
                <div className="lg:col-span-7 flex flex-col gap-4">

                    {/* ROW 1 — Big numbers */}
                    <div className="rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-6">
                        <div className="grid grid-cols-2 divide-x divide-white/10">
                            <div className="flex flex-col items-center justify-center pr-6">
                                <span className="text-6xl font-black text-orange-500 leading-none">
                                    {totalCount}
                                </span>
                                <span className="text-xs text-gray-400 mt-2 text-center">Contas a receber (mês)</span>
                            </div>
                            <div className="flex flex-col items-center justify-center pl-6">
                                <span className="text-6xl font-black text-orange-500 leading-none">
                                    {clientCount || totalCount}
                                </span>
                                <span className="text-xs text-gray-400 mt-2 text-center">Clientes</span>
                            </div>
                        </div>
                    </div>

                    {/* ROW 2 — 4 Status cards (Cross-Default risk buckets) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex flex-col justify-between rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-4 min-h-[90px]">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">A receber</span>
                            <div>
                                <p className="text-base font-extrabold text-green-400 leading-tight">
                                    {brl(totalAReceber)}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                    <TrendingUp size={10} className="text-green-400" /> Contratos em dia
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col justify-between rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-4 min-h-[90px]">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Em atraso</span>
                            <div>
                                <p className="text-base font-extrabold text-orange-400 leading-tight">
                                    {brl(totalAtraso)}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                    <TrendingDown size={10} className="text-orange-400" /> 1–14 dias
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col justify-between rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-4 min-h-[90px]">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide leading-tight">Inadimplência</span>
                            <div>
                                <p className="text-base font-extrabold text-red-400 leading-tight">
                                    {brl(totalInadimplencia)}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                    <TrendingDown size={10} className="text-red-400" /> 15–30 dias
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col justify-between rounded-2xl bg-black/60 backdrop-blur-md border border-red-500/20 p-4 min-h-[90px]">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide leading-tight">Perda Fat.</span>
                            <div>
                                <p className="text-base font-extrabold text-red-600 leading-tight">
                                    {brl(totalPerda)}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                    <AlertTriangle size={10} className="text-red-600" /> +30 dias
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ROW 3 — Action buttons */}
                    <div className="grid grid-cols-3 gap-4">
                        <ActionCardButton href="/cadastro" icon={<Banknote />} label="Lançamento de Recebimento" />
                        <ActionCardButton icon={<BookOpen />} label="Contas de recebimento" />
                        <ActionCardButton href="/consultar-clientes" icon={<UserSearch />} label="Consultar Clientes" />
                    </div>
                </div>

                {/* ════════════════════════════════════════
                    BOTTOM — Chart (col-span-12)
                ════════════════════════════════════════ */}
                <div className="lg:col-span-12 flex flex-col rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-6 gap-4">
                    <h2 className="text-base font-bold text-orange-500">Histórico de contas à receber</h2>

                    <RecebimentosChart
                        monthlyData={monthlyData}
                        currentMonth={currentMonth}
                        selectedDate={currentDate}
                        previsaoMes={previsaoMes}
                    />

                    <div className="flex justify-center pt-1 border-t border-white/10">
                        <Link 
                            href={`/contas-a-receber/lista?month=${currentMonth}`}
                            className="text-xs text-gray-400 hover:text-orange-500 transition-colors underline-offset-4 hover:underline"
                        >
                            ↓ Ver histórico de recebimentos
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}