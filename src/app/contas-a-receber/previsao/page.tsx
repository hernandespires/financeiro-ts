import Link from "next/link";
import {
    ArrowLeft,
    Wallet,
    Landmark,
    CreditCard,
    CalendarDays,
    CheckCircle2,
    Clock,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, toDateStr } from "@/lib/utils";
import { isParcelaValidaParaPrevisao } from "@/lib/financeRules";

export default async function PrevisaoCaixaPage({
    searchParams,
}: {
    searchParams: Promise<{ period?: string; date?: string; plataforma?: string }>;
}) {
    const params = await searchParams;
    const isAnnual = params.period === "annual";
    const selectedPlataforma = params.plataforma;

    const today = new Date();
    const todayStr = toDateStr(today);
    const currentDate =
        params.date ??
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "00")}`;
    const [year, month] = currentDate.split("-");

    // ── Date range ─────────────────────────────────────────────────────────────
    let startDate: string, endDate: string, titleLabel: string;
    if (isAnnual) {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        titleLabel = `Visão Anual (${year})`;
    } else {
        startDate = `${year}-${month}-01`;
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
        let lbl = new Date(`${year}-${month}-01T12:00:00`).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
        });
        titleLabel = lbl.charAt(0).toUpperCase() + lbl.slice(1);
    }

    // ── Prev / Next navigation strings ────────────────────────────────────────
    const prevMonthDate = new Date(Number(year), Number(month) - 2, 1);
    const nextMonthDate = new Date(Number(year), Number(month), 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const prevYearStr = `${Number(year) - 1}-01`;
    const nextYearStr = `${Number(year) + 1}-01`;

    const prevNav = isAnnual ? prevYearStr : prevMonthStr;
    const nextNav = isAnnual ? nextYearStr : nextMonthStr;
    const periodParam = isAnnual ? "annual" : "monthly";

    // ── Fetch parcelas by clearing date ───────────────────────────────────────
    const { data: parcelasData } = await supabaseAdmin
        .from("parcelas")
        .select(
            "id, valor_previsto, status_manual_override, data_disponibilidade_prevista, data_vencimento, deleted_at, contratos(deleted_at, forma_pagamento, clientes(nome_cliente, deleted_at))"
        )
        .is("deleted_at", null)             // exclude soft-deleted at DB level
        .gte("data_disponibilidade_prevista", startDate)
        .lte("data_disponibilidade_prevista", endDate)
        .order("data_disponibilidade_prevista", { ascending: true });

    // Apply strict forecast eligibility — also catches cascade-deleted parents
    const parcelas = (parcelasData ?? []).filter((p) =>
        isParcelaValidaParaPrevisao(p, todayStr)
    );

    // ── Aggregate KPIs & per-platform buckets ─────────────────────────────────
    let totalCaixa = 0;
    let totalRecebido = 0;
    let totalPendente = 0;

    const plataformas = new Map<
        string,
        { previsto: number; recebido: number; pendente: number; count: number }
    >();

    for (const p of parcelas) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const forma: string = (p.contratos as any)?.forma_pagamento || "NÃO DEFINIDO";
        const valor = p.valor_previsto || 0;
        const isPago = p.status_manual_override === "PAGO";

        if (!plataformas.has(forma)) {
            plataformas.set(forma, { previsto: 0, recebido: 0, pendente: 0, count: 0 });
        }
        const plat = plataformas.get(forma)!;
        plat.previsto += valor;
        plat.count += 1;
        totalCaixa += valor;

        if (isPago) {
            plat.recebido += valor;
            totalRecebido += valor;
        } else {
            plat.pendente += valor;
            totalPendente += valor;
        }
    }

    // Sort platforms by total descending
    const sortedPlataformas = Array.from(plataformas.entries()).sort(
        ([, a], [, b]) => b.previsto - a.previsto
    );

    // ── Accordion data: filter by selected platform or show all ───────────────
    const accordionParcelas = selectedPlataforma
        ? parcelas.filter(
            (p) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ((p.contratos as any)?.forma_pagamento || "NÃO DEFINIDO") === selectedPlataforma
        )
        : parcelas;

    const accordionGrouped = accordionParcelas.reduce(
        (acc, p) => {
            const date = p.data_disponibilidade_prevista || p.data_vencimento;
            if (!acc[date]) acc[date] = { total: 0, items: [] };
            acc[date].total += p.valor_previsto || 0;
            acc[date].items.push(p);
            return acc;
        },
        {} as Record<string, { total: number; items: typeof parcelas }>
    );

    const accordionDates = Object.keys(accordionGrouped).sort();
    const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0));

    return (
        <div className="flex flex-col gap-8 max-w-7xl mx-auto">

            {/* Breadcrumb + Period toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <nav className="flex items-center gap-2 text-xs">
                    <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                        Dashboard
                    </Link>
                    <span className="text-gray-600">/</span>
                    <Link href="/contas-a-receber" className="text-gray-400 hover:text-white transition-colors">
                        Contas à receber
                    </Link>
                    <span className="text-gray-600">/</span>
                    <span className="text-orange-500 font-semibold">Previsão de Caixa</span>
                </nav>

                <div className="flex items-center  border border-white/10 rounded-xl p-1">
                    <Link
                        href={`?period=monthly&date=${currentDate}`}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${!isAnnual ? "bg-orange-500 text-black" : "text-gray-400 hover:text-white"}`}
                    >
                        Mensal
                    </Link>
                    <Link
                        href={`?period=annual&date=${year}-01`}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${isAnnual ? "bg-orange-500 text-black" : "text-gray-400 hover:text-white"}`}
                    >
                        Anual
                    </Link>
                </div>
            </div>

            {/* Back button */}
            <Link
                href="/contas-a-receber"
                className="self-start flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500 text-gray-400 hover:text-orange-400 px-4 py-2 text-xs font-medium transition-all"
            >
                <ArrowLeft size={14} />
                Voltar para painel
            </Link>

            {/* Hero Card */}
            <div className="rounded-2xl  bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl p-8 shadow-[0_0_40px_rgba(249,115,22,0.06)]">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-orange-500">
                            <CalendarDays size={18} />
                            <span className="text-xs font-semibold uppercase tracking-widest">
                                Fluxo de Caixa (Disponibilidade)
                            </span>
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight">{titleLabel}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <Link
                                href={`?period=${periodParam}&date=${prevNav}`}
                                className="text-[10px] font-medium text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/50 rounded-lg px-2.5 py-1 transition-all"
                            >
                                ← Anterior
                            </Link>
                            <Link
                                href={`?period=${periodParam}&date=${nextNav}`}
                                className="text-[10px] font-medium text-gray-500 hover:text-orange-400 border border-white/10 hover:border-orange-500/50 rounded-lg px-2.5 py-1 transition-all"
                            >
                                Próximo →
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full lg:w-auto">
                        <div className="flex flex-col rounded-xl bg-white/5 border border-white/10 px-6 py-4 gap-1">
                            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                                <Landmark size={11} /> Caixa Previsto
                            </span>
                            <span className="text-2xl font-black text-white">{brl(totalCaixa)}</span>
                            <span className="text-[10px] text-gray-600">{parcelas.length} parcelas</span>
                        </div>
                        <div className="flex flex-col rounded-xl bg-green-500/10 border border-green-500/20 px-6 py-4 gap-1">
                            <span className="text-[10px] text-green-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                                <CheckCircle2 size={11} /> Já na Conta
                            </span>
                            <span className="text-2xl font-black text-green-400">{brl(totalRecebido)}</span>
                            <span className="text-[10px] text-gray-600">
                                {totalCaixa > 0 ? Math.round((totalRecebido / totalCaixa) * 100) : 0}% do total
                            </span>
                        </div>
                        <div className="flex flex-col rounded-xl bg-orange-500/10 border border-orange-500/20 px-6 py-4 gap-1">
                            <span className="text-[10px] text-orange-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                                <Clock size={11} /> A Cair
                            </span>
                            <span className="text-2xl font-black text-orange-500">{brl(totalPendente)}</span>
                            <span className="text-[10px] text-gray-600">
                                {totalCaixa > 0 ? Math.round((totalPendente / totalCaixa) * 100) : 0}% do total
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Platform grid */}
            <div className="flex items-center gap-2">
                <Wallet size={20} className="text-orange-500" />
                <h2 className="text-lg font-bold text-white">Origem do Dinheiro</h2>
                <span className="text-xs text-gray-500 ml-1">clique para filtrar o cronograma</span>
            </div>

            {sortedPlataformas.length === 0 ? (
                <div className="rounded-2xl  border border-white/10 py-20 text-center">
                    <p className="text-4xl mb-3">📭</p>
                    <p className="text-sm font-medium text-gray-500">
                        Nenhum recebimento previsto para este período.
                    </p>
                    <p className="text-[10px] text-gray-700 mt-1">
                        Verifique se as parcelas possuem <code>data_disponibilidade_prevista</code> preenchida.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedPlataformas.map(([nome, dados]) => {
                        const progress =
                            dados.previsto > 0
                                ? Math.round((dados.recebido / dados.previsto) * 100)
                                : 0;
                        const isSelected = selectedPlataforma === nome;
                        // Toggle: click selected card → clears filter; click unselected → sets it
                        const cardHref = `?period=${periodParam}&date=${currentDate}${isSelected ? "" : `&plataforma=${encodeURIComponent(nome)}`}`;

                        return (
                            <Link
                                key={nome}
                                href={cardHref}
                                scroll={false}
                                className={`flex flex-col rounded-2xl  backdrop-blur-md border p-6 gap-4 transition-all cursor-pointer ${isSelected
                                    ? "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.15)] ring-1 ring-orange-500"
                                    : "border-white/10 hover:border-orange-500/50 hover:bg-white/5"
                                    }`}
                            >
                                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                    <span className="text-sm font-bold text-white flex items-center gap-2">
                                        <CreditCard size={14} className="text-orange-500 shrink-0" />
                                        {nome}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400 bg-white/10 px-2 py-1 rounded-md whitespace-nowrap">
                                        {dados.count} parcela{dados.count !== 1 ? "s" : ""}
                                    </span>
                                </div>

                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] text-gray-500 uppercase font-semibold tracking-widest">Já recebido</span>
                                        <span className="text-xl font-bold text-green-400">{brl(dados.recebido)}</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[9px] text-gray-500 uppercase font-semibold tracking-widest">Pendente</span>
                                        <span className="text-xl font-bold text-orange-400">{brl(dados.pendente)}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-green-500 h-1.5 rounded-full transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] text-gray-600">
                                        <span>{progress}% recebido</span>
                                        <span>Total: {brl(dados.previsto)}</span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* ── Cronograma de Liberação (Accordion) ──────────────────────────────── */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                        <CalendarDays className="text-orange-500" />
                        {selectedPlataforma
                            ? `Cronograma Filtrado: ${selectedPlataforma}`
                            : "Cronograma Geral de Entradas"}
                    </h3>
                    {selectedPlataforma && (
                        <Link
                            href={`?period=${periodParam}&date=${currentDate}`}
                            scroll={false}
                            className="text-xs text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
                        >
                            Limpar Filtro
                        </Link>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    {accordionDates.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-10 bg-black/40 rounded-xl border border-white/10">
                            Nenhum recebimento previsto.
                        </p>
                    ) : (
                        accordionDates.map((dateStr) => {
                            const dayData = accordionGrouped[dateStr];
                            const dateObj = new Date(dateStr + "T12:00:00");
                            const isPast = dateObj < todayMidnight;

                            return (
                                <details
                                    key={dateStr}
                                    className="group flex flex-col  backdrop-blur-md rounded-xl border border-white/10 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
                                >
                                    {/* Summary / collapsed header */}
                                    <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none hover:bg-white/5 transition-colors focus:outline-none">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 text-gray-400 group-open:rotate-180 transition-transform duration-300">
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="m6 9 6 6 6-6" />
                                                </svg>
                                            </span>
                                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                                <CalendarDays
                                                    size={14}
                                                    className={isPast ? "text-green-500" : "text-orange-500"}
                                                />
                                                {fmtDate(dateStr)}
                                                <span className="text-[10px] text-gray-500 font-normal ml-1">
                                                    ({dateObj.toLocaleDateString("pt-BR", { weekday: "long" })})
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-semibold text-gray-500">
                                                {dayData.items.length} transaç{dayData.items.length !== 1 ? "ões" : "ão"}
                                            </span>
                                            <span className="text-sm font-black text-orange-400">
                                                {brl(dayData.total)}
                                            </span>
                                        </div>
                                    </summary>

                                    {/* Expanded content */}
                                    <div className="flex flex-col gap-2 p-4 pt-0 border-t border-white/5 bg-black/40">
                                        {dayData.items.map((p) => {
                                            const isPago = p.status_manual_override === "PAGO";
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const plat = (p.contratos as any)?.forma_pagamento || "NÃO DEFINIDO";
                                            return (
                                                <div
                                                    key={p.id}
                                                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-black/40 rounded-lg p-3 border border-white/5 hover:border-white/10 transition-colors mt-2"
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold text-white">
                                                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                                {(p.contratos as any)?.clientes?.nome_cliente || "Desconhecido"}
                                                            </span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 border border-white/5 tracking-wider">
                                                                {plat}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500">
                                                            Venceu original: {fmtDate(p.data_vencimento)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-2 sm:mt-0">
                                                        <span
                                                            className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${isPago
                                                                ? "bg-green-500/10 text-green-400"
                                                                : "bg-orange-500/10 text-orange-400"
                                                                }`}
                                                        >
                                                            {isPago ? "Recebido" : "Pendente"}
                                                        </span>
                                                        <span className="text-xs font-bold text-white whitespace-nowrap">
                                                            {brl(p.valor_previsto)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            );
                        })
                    )}
                </div>
            </div>

        </div>
    );
}
