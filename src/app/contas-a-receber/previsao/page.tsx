import Link from "next/link";
import {
  Wallet,
  Landmark,
  CreditCard,
  CalendarDays,
  CheckCircle2,
  Clock,
  BarChart2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, toDateStr } from "@/lib/utils";
import {
  isParcelaValidaParaPrevisao,
  getContratosSujos,
  STATUSES_PARCELA_EXCLUIDOS_PREVISAO,
  syncPagamentosStatus,
} from "@/lib/financeRules";
import PrevisaoFluxoChart from "@/components/PrevisaoFluxoChart";

export default async function PrevisaoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    date?: string;
    plataforma?: string;
    statusFiltro?: string;
  }>;
}) {
  const params = await searchParams;
  const isAnnual = params.period === "annual";
  const selectedPlataforma = params.plataforma;
  const selectedStatus = params.statusFiltro;

  const today = new Date();
  const todayStr = toDateStr(today);
  const rawDate = params.date ?? todayStr;
  // Normalize: if only "YYYY-MM" (no day), treat as first day of that month
  const currentDate = rawDate.length === 7 ? `${rawDate}-01` : rawDate;
  const [year, month] = currentDate.split("-");
  const currentMonth = `${year}-${month}`;

  // ── Date range ─────────────────────────────────────────────────────────────
  let startDate: string, endDate: string, titleLabel: string;
  if (isAnnual) {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    titleLabel = `Visão Anual — ${year}`;
  } else {
    startDate = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    let lbl = new Date(`${year}-${month}-01T12:00:00`).toLocaleDateString(
      "pt-BR",
      {
        month: "long",
        year: "numeric",
      },
    );
    titleLabel = lbl.charAt(0).toUpperCase() + lbl.slice(1);
  }

  // ── Prev / Next ────────────────────────────────────────────────────────────
  const prevMonthDate = new Date(Number(year), Number(month) - 2, 1);
  const nextMonthDate = new Date(Number(year), Number(month), 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const prevNav = isAnnual ? `${Number(year) - 1}-01-01` : `${prevMonthStr}-01`;
  const nextNav = isAnnual ? `${Number(year) + 1}-01-01` : `${nextMonthStr}-01`;
  const periodParam = isAnnual ? "annual" : "monthly";

  // ── Sync + Fetch ────────────────────────────────────────────────────────────
  const [, { data: openData }, { data: parcelasData }] = await Promise.all([
    syncPagamentosStatus(supabaseAdmin),
    supabaseAdmin
      .from("parcelas")
      .select(
        "contrato_id, data_vencimento, status_manual_override, deleted_at, contratos(deleted_at, clientes(deleted_at))",
      )
      .in("status_manual_override", [
        "NORMAL",
        "INADIMPLENTE",
        "PERDA DE FATURAMENTO",
      ]),
    supabaseAdmin
      .from("parcelas")
      .select(
        `id, valor_previsto, valor_bruto, status_manual_override,
                 data_disponibilidade_prevista, data_vencimento, contrato_id, deleted_at,
                 contratos(forma_pagamento, deleted_at, clientes(id, nome_cliente, deleted_at)),
                 pagamentos(valor_pago, status_pagamento, disponivel_em)`,
      )
      .gte("data_disponibilidade_prevista", startDate)
      .lte("data_disponibilidade_prevista", endDate)
      .order("data_disponibilidade_prevista", { ascending: true }),
  ]);

  const contratosSujos = getContratosSujos(openData ?? [], todayStr);

  const parcelasValidas = (parcelasData ?? [])
    .filter((p: any) =>
      isParcelaValidaParaPrevisao(p, todayStr, contratosSujos),
    )
    .filter(
      (p: any) =>
        !STATUSES_PARCELA_EXCLUIDOS_PREVISAO.has(
          p.status_manual_override ?? "",
        ),
    );

  // ── Helpers ────────────────────────────────────────────────────────────────
  function classificar(p: any): "em_dia" | "atrasado" | "processando" | "pago" {
    const isPago =
      p.status_manual_override === "PAGO" ||
      p.status_manual_override === "INADIMPLENTE RECEBIDO";
    if (isPago) {
      const pags = Array.isArray(p.pagamentos)
        ? p.pagamentos
        : p.pagamentos
          ? [p.pagamentos]
          : [];
      return (pags[0] as any)?.status_pagamento === "PROCESSANDO"
        ? "processando"
        : "pago";
    }
    const dias = Math.round(
      (new Date(todayStr).getTime() - new Date(p.data_vencimento).getTime()) /
        86400000,
    );
    return dias > 0 ? "atrasado" : "em_dia";
  }

  function getValor(p: any): number {
    const isPago =
      p.status_manual_override === "PAGO" ||
      p.status_manual_override === "INADIMPLENTE RECEBIDO";
    if (isPago) {
      const pags = Array.isArray(p.pagamentos)
        ? p.pagamentos
        : p.pagamentos
          ? [p.pagamentos]
          : [];
      const vp = (pags[0] as any)?.valor_pago;
      if (vp != null) return Number(vp);
    }
    return Number(p.valor_bruto ?? p.valor_previsto ?? 0);
  }

  function getPlataforma(p: any): string {
    return (p.contratos as any)?.forma_pagamento || "NÃO DEFINIDO";
  }

  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string | undefined> = {
      period: periodParam,
      date: currentDate,
      plataforma: selectedPlataforma,
      statusFiltro: selectedStatus,
      ...overrides,
    };
    const qs = Object.entries(base)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/contas-a-receber/previsao?${qs}`;
  }

  // ── Apply filters ──────────────────────────────────────────────────────────
  const parcelas = selectedStatus
    ? parcelasValidas.filter((p: any) => classificar(p) === selectedStatus)
    : parcelasValidas;

  const parcelasFiltradas = selectedPlataforma
    ? parcelas.filter((p: any) => getPlataforma(p) === selectedPlataforma)
    : parcelas;

  // ── KPIs ───────────────────────────────────────────────────────────────────
  let totalCaixa = 0,
    totalRecebido = 0,
    totalPendente = 0;
  const plataformasMap = new Map<
    string,
    { previsto: number; recebido: number; pendente: number; count: number }
  >();

  for (const p of parcelas) {
    const forma = getPlataforma(p);
    const valor = getValor(p);
    const cls = classificar(p);

    if (!plataformasMap.has(forma))
      plataformasMap.set(forma, {
        previsto: 0,
        recebido: 0,
        pendente: 0,
        count: 0,
      });
    const plat = plataformasMap.get(forma)!;
    plat.previsto += valor;
    plat.count += 1;
    totalCaixa += valor;

    if (cls === "pago" || cls === "processando") {
      plat.recebido += valor;
      totalRecebido += valor;
    } else {
      plat.pendente += valor;
      totalPendente += valor;
    }
  }

  const sortedPlataformas = Array.from(plataformasMap.entries()).sort(
    ([, a], [, b]) => b.previsto - a.previsto,
  );

  // ── Daily agenda ──────────────────────────────────────────────────────────
  const parcelasDoDia = parcelasFiltradas.filter(
    (p: any) =>
      (p.data_disponibilidade_prevista || p.data_vencimento) === currentDate,
  );
  const totalDoDia = parcelasDoDia.reduce(
    (sum: number, p: any) => sum + getValor(p),
    0,
  );

  // ── Chart data ─────────────────────────────────────────────────────────────
  const monthNames = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const chartData: { date: string; day: string; total: number }[] = [];

  if (isAnnual && year) {
    const sumByMonth = new Map<string, number>();
    for (const p of parcelasFiltradas) {
      const dKey =
        (p as any).data_disponibilidade_prevista || (p as any).data_vencimento;
      if (!dKey) continue;
      const ym = dKey.slice(0, 7);
      sumByMonth.set(ym, (sumByMonth.get(ym) ?? 0) + getValor(p));
    }
    for (let i = 0; i < 12; i++) {
      const mStr = String(i + 1).padStart(2, "0");
      const ym = `${year}-${mStr}`;
      chartData.push({
        date: ym,
        day: monthNames[i],
        total: sumByMonth.get(ym) ?? 0,
      });
    }
  } else {
    const sumByDate = new Map<string, number>();
    for (const p of parcelasFiltradas) {
      const key =
        (p as any).data_disponibilidade_prevista || (p as any).data_vencimento;
      sumByDate.set(key, (sumByDate.get(key) ?? 0) + getValor(p));
    }
    const days = new Date(Number(year), Number(month), 0).getDate();
    for (let i = 0; i < days; i++) {
      const dayStr = String(i + 1).padStart(2, "0");
      const date = `${currentMonth}-${dayStr}`;
      chartData.push({ date, day: dayStr, total: sumByDate.get(date) ?? 0 });
    }
  }

  const STATUS_LABELS: Record<
    string,
    { label: string; color: string; activeColor: string }
  > = {
    em_dia: {
      label: "Em Dia",
      color: "text-gray-500 border-[#222]",
      activeColor: "text-green-400 border-green-500/40 bg-green-500/10",
    },
    atrasado: {
      label: "Atrasado",
      color: "text-gray-500 border-[#222]",
      activeColor: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    },
    processando: {
      label: "Processando",
      color: "text-gray-500 border-[#222]",
      activeColor: "text-blue-400 border-blue-500/40 bg-blue-500/10",
    },
    pago: {
      label: "Pago",
      color: "text-gray-500 border-[#222]",
      activeColor: "text-[#34C759] border-[#34C759]/40 bg-[#34C759]/10",
    },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb + controls ── */}
      <div className="flex justify-between">
        <nav className="flex gap-2 text-[10px]">
          <Link
            href="/"
            className="text-gray-500 hover:text-white transition-colors"
          >
            Dashboard
          </Link>
          <span className="text-gray-700">/</span>
          <Link
            href="/contas-a-receber"
            className="text-gray-500 hover:text-white transition-colors"
          >
            Contas à Receber
          </Link>
          <span className="text-gray-700">/</span>
          <span className="text-[#ffa300] font-semibold">
            Previsão de Caixa
          </span>
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex bg-[#111] border border-[#222] rounded-full p-1 h-9">
            <Link
              href="/contas-a-receber/lista"
              className="px-4 py-1 text-[11px] font-medium rounded-full text-gray-500 hover:text-white transition-all flex items-center"
            >
              Mesa de Operações
            </Link>
            <span className="px-4 py-1 text-[11px] font-semibold rounded-full bg-white/10 text-white cursor-default flex items-center">
              Previsão
            </span>
          </div>
          <div className="flex items-center border border-[#222] rounded-xl p-1 bg-[#111] h-9">
            <Link
              href={buildUrl({ period: "monthly" })}
              className={`px-4 py-1 text-[11px] font-bold rounded-lg transition-all ${!isAnnual ? "bg-[#ffa300] text-black" : "text-gray-400 hover:text-white"}`}
            >
              Mensal
            </Link>
            <Link
              href={buildUrl({ period: "annual", date: `${year}-01` })}
              className={`px-4 py-1 text-[11px] font-bold rounded-lg transition-all ${isAnnual ? "bg-[#ffa300] text-black" : "text-gray-400 hover:text-white"}`}
            >
              Anual
            </Link>
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex  justify-between">
        <div>
          <h1 className="text-2xl text-white tracking-tight mb-1">
            {titleLabel}
          </h1>
          <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
            <CalendarDays size={11} className="text-#ffa300" />
            Fluxo de Caixa por data de disponibilidade
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={buildUrl({ date: prevNav })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#222] bg-[#111] text-gray-500 hover:text-white hover:border-[#444] transition-all text-sm font-bold"
          >
            ←
          </Link>
          <Link
            href={buildUrl({ date: nextNav })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#222] bg-[#111] text-gray-500 hover:text-white hover:border-[#444] transition-all text-sm font-bold"
          >
            →
          </Link>
        </div>
      </div>

      {/* ── KPI cards: Caixa Previsto | A Cair | Já na Conta ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border border-white/5 hover:border-[#028aa4]/30 p-5 transition-all shadow-2xl">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#028aa4]">
            <Landmark size={13} /> Caixa Previsto
          </div>
          <div>
            <span className="text-2xl font-black text-white leading-none tracking-tight">
              {brl(totalCaixa)}
            </span>
            <p className="text-[10px] text-gray-600 mt-1">
              {parcelas.length} parcela{parcelas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border border-white/5 hover:border-[#ffa300]/30 p-5 transition-all shadow-2xl">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#ffa300]">
            <Clock size={13} /> A Cair
          </div>
          <div>
            <span className="text-2xl font-black text-[#ffa300] leading-none tracking-tight">
              {brl(totalPendente)}
            </span>
            <p className="text-[10px] text-gray-600 mt-1">
              {totalCaixa > 0
                ? Math.round((totalPendente / totalCaixa) * 100)
                : 0}
              % do total
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border border-white/5 hover:border-[#34C759]/30 p-5 transition-all shadow-2xl">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#34C759]">
            <CheckCircle2 size={13} /> Já na Conta
          </div>
          <div>
            <span className="text-2xl font-black text-[#34C759] leading-none tracking-tight">
              {brl(totalRecebido)}
            </span>
            <p className="text-[10px] text-gray-600 mt-1">
              {totalCaixa > 0
                ? Math.round((totalRecebido / totalCaixa) * 100)
                : 0}
              % do total
            </p>
          </div>
        </div>
      </div>

      {/* ── Status filters only ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <Filter size={11} />
          <span className="font-bold uppercase tracking-widest">Filtrar:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(STATUS_LABELS).map(
            ([key, { label, color, activeColor }]) => {
              const isActive = selectedStatus === key;
              return (
                <Link
                  key={key}
                  href={buildUrl({ statusFiltro: isActive ? undefined : key })}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${isActive ? activeColor : `${color} hover:text-gray-200 hover:border-[#444] bg-[#111]`}`}
                >
                  {label}
                </Link>
              );
            },
          )}
        </div>
        {selectedStatus && (
          <Link
            href={buildUrl({ statusFiltro: undefined })}
            className="text-[10px] text-gray-600 hover:text-gray-300 transition-colors"
          >
            Limpar ×
          </Link>
        )}
      </div>

      {/* ── Platform cards (no wrapper — inline grid) ── */}
      {sortedPlataformas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-[#222] bg-[#0A0A0A]">
          <span className="text-4xl opacity-30 mb-3">📭</span>
          <span className="text-sm font-medium text-gray-500">
            Nenhum recebimento previsto para este período.
          </span>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={12} className="text-[#ffa300]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Origem do Dinheiro
            </span>
            <span className="text-[10px] text-gray-600">
              — clique para filtrar
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPlataformas.map(([nome, dados]) => {
              const progress =
                dados.previsto > 0
                  ? Math.round((dados.recebido / dados.previsto) * 100)
                  : 0;
              const isSelected = selectedPlataforma === nome;
              return (
                <Link
                  key={nome}
                  href={buildUrl({ plataforma: isSelected ? undefined : nome })}
                  scroll={false}
                  className={`flex flex-col rounded-2xl border p-5 gap-4 transition-all ${isSelected ? "border-[#ffa300]/60 bg-[#111] shadow-[0_0_15px_rgba(255,163,0,0.1)]" : "border-white/5 bg-[#0A0A0A] hover:border-[#ffa300]/30 hover:bg-[#111]"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <CreditCard
                        size={12}
                        className="text-[#ffa300] shrink-0"
                      />
                      {nome}
                    </span>
                    <span className="text-[9px] font-bold text-gray-400 bg-white/10 px-2 py-0.5 rounded">
                      {dados.count} parcela{dados.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest block mb-0.5">
                        Já recebido
                      </span>
                      <span className="text-base font-black text-[#34C759]">
                        {brl(dados.recebido)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest block mb-0.5">
                        Pendente
                      </span>
                      <span className="text-base font-black text-[#ffa300]">
                        {brl(dados.pendente)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-[#34C759] h-1 rounded-full transition-all"
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
        </div>
      )}

      {/* ── Fluxo Chart + Agenda side by side ── */}
      {!isAnnual && (
        <div className="grid grid-cols-1 lg:[grid-template-columns:3fr_2fr] gap-4">
          {/* Chart */}
          <div className="rounded-2xl bg-[#0A0A0A] border border-[#222] shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={12} className="text-[#ffa300]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Fluxo de Caixa
              </span>
            </div>
            <PrevisaoFluxoChart
              data={chartData}
              selectedDate={currentDate}
              currentMonth={currentMonth}
              isAnnual={isAnnual}
              year={year}
              previsaoMes={parcelasFiltradas.reduce(
                (s: number, p: any) => s + getValor(p),
                0,
              )}
              plataforma={selectedPlataforma}
              statusFiltro={selectedStatus}
            />
          </div>

          {/* Agenda */}
          <div className="rounded-2xl bg-[#0A0A0A] border border-[#222] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <CalendarDays size={12} className="text-[#ffa300]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Agenda —{" "}
                  <span className="text-[#ffa300] normal-case font-semibold">
                    {fmtDate(currentDate)}
                  </span>
                </span>
              </div>
              {totalDoDia > 0 && (
                <span className="text-xs font-black text-[#34C759] bg-[#34C759]/10 px-3 py-1 rounded-lg border border-[#34C759]/20">
                  {brl(totalDoDia)}
                </span>
              )}
            </div>
            {parcelasDoDia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600 gap-2">
                <span className="text-3xl">📭</span>
                <span className="text-sm font-medium">
                  Nenhum recebimento para este dia.
                </span>
                <span className="text-[10px]">
                  Clique em um ponto do gráfico.
                </span>
              </div>
            ) : (
              <div className="divide-y divide-[#1a1a1a] max-h-[340px] overflow-y-auto">
                {parcelasDoDia.map((p: any) => {
                  const cls = classificar(p);
                  const plat = getPlataforma(p);
                  const nome =
                    (p.contratos as any)?.clientes?.nome_cliente ||
                    "Desconhecido";
                  const clientId = (p.contratos as any)?.clientes?.id;
                  const valor = getValor(p);
                  const statusBadge =
                    cls === "pago"
                      ? {
                          label: "Recebido",
                          cls: "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20",
                        }
                      : cls === "processando"
                        ? {
                            label: "Processando",
                            cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                          }
                        : cls === "atrasado"
                          ? {
                              label: "Atrasado",
                              cls: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                            }
                          : {
                              label: "Pendente",
                              cls: "bg-[#ffa300]/10 text-[#ffa300] border-[#ffa300]/20",
                            };
                  return (
                    <Link
                      key={p.id}
                      href={clientId ? `/cliente/${clientId}` : "#"}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-[#111] transition-all group"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white group-hover:text-[#ffa300] transition-colors truncate">
                            {nome}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-bold tracking-widest uppercase shrink-0">
                            {plat}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-600">
                          Venc. {fmtDate(p.data_vencimento)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest ${statusBadge.cls}`}
                        >
                          {statusBadge.label}
                        </span>
                        <span className="text-sm font-black text-white">
                          {brl(valor)}
                        </span>
                        <ChevronRight
                          size={12}
                          className="text-gray-600 group-hover:text-[#ffa300] transition-colors"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Annual chart ── */}
      {isAnnual && (
        <div className="rounded-2xl bg-[#0A0A0A] border border-[#222] shadow-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={12} className="text-[#ffa300]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Fluxo Anual {year}
            </span>
            <span className="text-[10px] text-gray-600">
              — clique num mês para detalhar
            </span>
          </div>
          <PrevisaoFluxoChart
            data={chartData}
            selectedDate={currentDate}
            currentMonth={currentMonth}
            isAnnual={isAnnual}
            year={year}
            previsaoMes={parcelasFiltradas.reduce(
              (s: number, p: any) => s + getValor(p),
              0,
            )}
            plataforma={selectedPlataforma}
            statusFiltro={selectedStatus}
          />
        </div>
      )}
    </div>
  );
}
