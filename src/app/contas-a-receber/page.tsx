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
import RecebimentosChart, { ChartDataPoint } from "@/components/RecebimentosChart";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawParcela {
    id: string;
    contrato_id: string;          // needed for cross-default grouping
    valor_previsto: number;
    data_vencimento: string;      // "YYYY-MM-DD"
    status_manual_override: string;
    observacao?: string | null;
    contratos?: {
        clientes?: {
            nome_cliente?: string | null;
        } | null;
    } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Returns "YYYY-MM-DD" for the given Date — safely ignoring timezone shifts */
const toDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Days late: positive = past due, negative = in the future, 0 = today */
const daysLate = (dueDateStr: string, todayStr: string): number => {
    const due = new Date(dueDateStr + "T00:00:00");
    const tod = new Date(todayStr + "T00:00:00");
    return Math.round((tod.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
};

// ─── Page (async Server Component) ───────────────────────────────────────────
export default async function ContasAReceberPage() {
    const todayStr = toDateStr(new Date());

    // ── 1. Fetch parcelas with relational join ─────────────────────────────────
    const { data: parcelasData, error } = await supabaseAdmin
        .from("parcelas")
        .select("*, contratos(clientes(nome_cliente))")
        .eq("status_manual_override", "NORMAL")
        .order("data_vencimento", { ascending: true });

    if (error) {
        console.error("[ContasAReceber] Supabase error:", error.message);
    }

    const parcelas: RawParcela[] = (parcelasData ?? []) as RawParcela[];

    // ── 2. CONTRACT-LEVEL RISK ASSESSMENT (Cross-Default logic) ────────────────
    // Group all parcels by contrato_id, then classify the ENTIRE contract balance
    // by the worst (maxDaysLate) parcel in that group.
    //
    // Buckets:
    //   totalAReceber    → maxDaysLate ≤ 0  (all due today or in the future)
    //   totalAtraso      → maxDaysLate 1–14 days
    //   totalInadimplencia → maxDaysLate 15–30 days
    //   totalPerda       → maxDaysLate > 30 (entire balance is a write-off risk)

    // Step A: group parcels by contrato_id
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

    // Step B: for each contract, find worst delay and sum its entire balance
    for (const [, group] of contratoMap) {
        const contractBalance = group.reduce((s, p) => s + (p.valor_previsto ?? 0), 0);
        const maxLate = Math.max(...group.map((p) => daysLate(p.data_vencimento, todayStr)));

        if (maxLate > 30) totalPerda += contractBalance;
        else if (maxLate >= 15) totalInadimplencia += contractBalance;
        else if (maxLate >= 1) totalAtraso += contractBalance;
        else totalAReceber += contractBalance;
    }

    // ── 3. Today's agenda (LEFT column — strict today filter) ──────────────────
    // Timezone-safe: compare "YYYY-MM-DD" strings directly to avoid UTC offset bugs.
    const parcelasHoje = parcelas.filter((p) => p.data_vencimento === todayStr);
    const totalHoje = parcelasHoje.reduce((sum, p) => sum + (p.valor_previsto ?? 0), 0);

    const totalCount = parcelas.length;
    const clientCount = new Set(
        parcelas
            .map((p) => p.contratos?.clientes?.nome_cliente)
            .filter(Boolean)
    ).size;

    // ── 4. Chart: 30-day window centered on today ─────────────────────────────
    const windowStart = new Date(todayStr + "T00:00:00");
    windowStart.setDate(windowStart.getDate() - 10);

    const windowEnd = new Date(todayStr + "T00:00:00");
    windowEnd.setDate(windowEnd.getDate() + 19);

    // Build ordered bucket map
    const bucketsMap = new Map<string, { displayLabel: string; value: number; isFuture: boolean }>();
    const cursor = new Date(windowStart);
    while (cursor <= windowEnd) {
        const key = toDateStr(cursor);
        const label = cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        bucketsMap.set(key, { displayLabel: label, value: 0, isFuture: key > todayStr });
        cursor.setDate(cursor.getDate() + 1);
    }

    // Aggregate parcelas into buckets
    for (const p of parcelas) {
        const bucket = bucketsMap.get(p.data_vencimento);
        if (bucket) {
            bucket.value += p.valor_previsto;
        }
    }

    const chartData: ChartDataPoint[] = Array.from(bucketsMap.values()).map((b) => ({
        date: b.displayLabel,
        value: b.value,
        isFuture: b.isFuture,
    }));

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
            LEFT — List / Search  (col-span-5)
        ════════════════════════════════════════ */}
                <div className="lg:col-span-5 flex flex-col rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-5 gap-4">

                    {/* Header — TODAY only */}
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold text-white leading-tight">
                                {parcelasHoje.length} Contas a receber
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                                Agenda do dia — {new Date(todayStr + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
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
                        {/* Header row */}
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
                                    <div
                                        key={p.id}
                                        className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center px-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs text-white font-medium truncate">{nome}</span>
                                            <span className="text-[10px] text-orange-400/70">Vence hoje</span>
                                        </div>
                                        <span className="text-xs text-orange-400 truncate">{obs}</span>
                                        <span className="text-xs text-white font-semibold whitespace-nowrap">
                                            {brl(p.valor_previsto)}
                                        </span>
                                        <ChevronRight size={14} className="text-gray-500" />
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-600 text-xs gap-2">
                                <span className="text-2xl">📭</span>
                                <span>Nenhum recebimento para hoje</span>
                                <span className="text-[10px] text-gray-700">Os vencimentos do dia aparecerão aqui</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <button className="text-xs text-gray-400 hover:text-orange-500 transition-colors underline-offset-4 hover:underline">
                            Visualizar todos recebimentos
                        </button>
                        <div className="flex gap-2">
                            <button className="text-xs text-gray-500 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-white/30">
                                Anterior
                            </button>
                            <button className="text-xs text-gray-500 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-white/30">
                                Próximo
                            </button>
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

                        {/* A receber */}
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

                        {/* Em atraso */}
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

                        {/* Inadimplência */}
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

                        {/* Perda de faturamento */}
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
                        <Link
                            href="/cadastro"
                            className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors p-5 min-h-[110px] text-center"
                        >
                            <Banknote size={28} strokeWidth={1.8} className="text-black" />
                            <span className="text-xs font-bold text-black leading-tight">Lançamento de Recebimento</span>
                        </Link>

                        <button className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors p-5 min-h-[110px] text-center">
                            <BookOpen size={28} strokeWidth={1.8} className="text-black" />
                            <span className="text-xs font-bold text-black leading-tight">Contas de recebimento</span>
                        </button>

                        <Link
                            href="/consultar-clientes"
                            className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors p-5 min-h-[110px] text-center"
                        >
                            <UserSearch size={28} strokeWidth={1.8} className="text-black" />
                            <span className="text-xs font-bold text-black leading-tight">Consultar Clientes</span>
                        </Link>
                    </div>
                </div>

                {/* ════════════════════════════════════════
            BOTTOM — Chart (col-span-12)
        ════════════════════════════════════════ */}
                <div className="lg:col-span-12 flex flex-col rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-6 gap-5">

                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-orange-500">
                            Histórico de contas à receber
                        </h2>
                        <span className="rounded-full bg-orange-500/15 border border-orange-500/40 px-4 py-1 text-xs font-bold text-orange-400">
                            Previsão {brl(totalAReceber)}
                        </span>
                    </div>

                    <RecebimentosChart data={chartData} />

                    <div className="flex justify-center pt-1 border-t border-white/10">
                        <button className="text-xs text-gray-400 hover:text-orange-500 transition-colors underline-offset-4 hover:underline">
                            ↓ Ver histórico de recebimentos
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
