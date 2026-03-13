import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  TrendingUp,
  Landmark,
  Wallet,
  Users,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, fmtDate, daysLate, toDateStr } from "@/lib/utils";
import {
  syncFinanceStatuses,
  syncPagamentosStatus,
  STATUSES_NAO_MOSTRAR_NA_LISTA,
} from "@/lib/financeRules";
import ParcelaActions, {
  type ParcelaForActions,
} from "@/components/ParcelaActions";
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
type RowStatus =
  | "PAGO"
  | "PROCESSANDO"
  | "INADIMPLENTE"
  | "PERDA"
  | "EM_INADIMPLENCIA"
  | "EM_PERDA"
  | "ATRASADO"
  | "VENCE_HOJE"
  | "VENCE_EM_BREVE"
  | "A_RECEBER";

interface Row extends RawParcela {
  rowStatus: RowStatus;
  daysLateVal: number;
  agenciaNome: string | null;
  pagamento: RawPagamento | null;
}

// ─── Design System: UI Components ─────────────────────────────────────────────

function StatusPill({
  status,
  daysLateVal,
}: {
  status: RowStatus;
  daysLateVal: number;
}) {
  const map: Record<RowStatus, string> = {
    PAGO: "text-[#34C759] bg-[#34C759]/10 border-[#34C759]/20",
    PROCESSANDO: "text-[#028aa4] bg-[#028aa4]/10 border-[#028aa4]/20",
    // Root overdue statuses — bright alarm red
    INADIMPLENTE: "text-[#FF453A] bg-[#FF453A]/10 border-[#FF453A]/20",
    PERDA: "text-[#FF3B30] bg-[#FF3B30]/10 border-[#FF3B30]/20",
    // Contagion statuses — dark burgundy, muted tone: "blocked by root"
    EM_INADIMPLENCIA: "text-[#D96060] bg-[#2D0808]/70 border-[#6B2020]/50",
    EM_PERDA: "text-[#B84040] bg-[#1A0303]/70 border-[#521212]/50",
    ATRASADO: "text-[#FF9500] bg-[#FF9500]/10 border-[#FF9500]/20",
    VENCE_HOJE: "text-[#FFD60A] bg-[#FFD60A]/10 border-[#FFD60A]/20",
    VENCE_EM_BREVE: "text-[#FFD60A] bg-[#FFD60A]/10 border-[#FFD60A]/20",
    A_RECEBER: "text-gray-300 bg-white/5 border-white/10",
  };
  const labels: Record<RowStatus, string> = {
    PAGO: "Recebido",
    PROCESSANDO: "Processando",
    INADIMPLENTE: "Inadimplente",
    PERDA: "Perda de Fatura",
    EM_INADIMPLENCIA: "Possui Inadimplência",
    EM_PERDA: "Possui Perda",
    ATRASADO: "Atrasado",
    VENCE_HOJE: "Vence Hoje",
    VENCE_EM_BREVE: "Vence em Breve",
    A_RECEBER: "A Receber",
  };

  if (status === "ATRASADO" && daysLateVal > 0) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase border ${map[status]}`}
        >
          {labels[status]}
        </span>
        <span className="text-[9px] text-gray-500 font-medium whitespace-nowrap">
          {daysLateVal} d
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase border ${map[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function FaturaDot({ rowStatus }: { rowStatus: RowStatus }) {
  let color = "bg-gray-400";

  if (rowStatus === "PAGO") color = "bg-[#34C759]";
  else if (rowStatus === "INADIMPLENTE" || rowStatus === "EM_INADIMPLENCIA")
    color = "bg-[#fa1e46]";
  else if (rowStatus === "PERDA" || rowStatus === "EM_PERDA")
    color = "bg-[#FF3B30]";
  else if (rowStatus === "ATRASADO") color = "bg-[#FF9500]";
  else if (rowStatus === "VENCE_HOJE" || rowStatus === "VENCE_EM_BREVE")
    color = "bg-[#FFD60A]";

  return (
    <div
      className={`w-2.5 h-2.5 rounded-full shrink-0 mx-auto ${color}`}
      title={`Status da Fatura: ${rowStatus}`}
    />
  );
}

function KpiCard({
  icon,
  label,
  value,
  color = "orange",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: "orange" | "green" | "red" | "blue" | "gray";
}) {
  const theme = {
    orange: {
      text: "text-[#ffa300]",
      border: "border-white/5 hover:border-[#ffa300]/30",
    },
    green: {
      text: "text-[#34C759]",
      border: "border-white/5 hover:border-[#34C759]/30",
    },
    red: {
      text: "text-[#FF453A]",
      border: "border-white/5 hover:border-[#FF453A]/30",
    },
    blue: {
      text: "text-[#028aa4]",
      border: "border-white/5 hover:border-[#028aa4]/30",
    },
    gray: {
      text: "text-gray-400",
      border: "border-white/5 hover:border-gray-500/30",
    },
  }[color];

  return (
    <div
      className={`flex flex-col justify-between gap-3 rounded-2xl bg-[#0A0A0A] border ${theme.border} p-5 transition-all shadow-2xl`}
    >
      <div
        className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${theme.text}`}
      >
        {icon}
        {label}
      </div>
      <span className="text-2xl font-black text-white leading-none tracking-tight">
        {value}
      </span>
    </div>
  );
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
    plataforma?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const p = await searchParams;
  const currentMonth = p.month ?? new Date().toISOString().slice(0, 7);
  const statusFilter = (p.status ?? "").toLowerCase();
  const agenciaFilter = p.agencia ?? "";
  const categoriaFilter = p.categoria ?? "";
  const searchFilter = (p.search ?? "").toLowerCase().trim();
  const plataformaFilter = (p.plataforma ?? "").toLowerCase();
  const sortCol = p.sort ?? "";
  const sortOrder = p.order ?? "asc";
  const todayStr = toDateStr(new Date());

  const [y, mo] = currentMonth.split("-").map(Number);
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
    if (p.plataforma) qs.set("plataforma", p.plataforma);
    if (p.search) qs.set("search", p.search);
    if (p.sort) qs.set("sort", p.sort);
    if (p.order) qs.set("order", p.order);
    return `?${qs.toString()}`;
  };

  const buildSortUrl = (column: string) => {
    const qs = new URLSearchParams();
    if (p.month) qs.set("month", p.month);
    if (p.status) qs.set("status", p.status);
    if (p.agencia) qs.set("agencia", p.agencia);
    if (p.categoria) qs.set("categoria", p.categoria);
    if (p.plataforma) qs.set("plataforma", p.plataforma);
    if (p.search) qs.set("search", p.search);

    if (sortCol === column) {
      qs.set("sort", column);
      qs.set("order", sortOrder === "asc" ? "desc" : "asc");
    } else {
      qs.set("sort", column);
      qs.set("order", "asc");
    }
    return `?${qs.toString()}`;
  };

  const prevMonthUrl = buildMonthUrl(
    `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`,
  );
  const nextMonthUrl = buildMonthUrl(
    `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`,
  );

  await syncFinanceStatuses(supabaseAdmin);
  await syncPagamentosStatus(supabaseAdmin);

  const { data: rawData } = await supabaseAdmin
    .from("parcelas")
    .select(
      `
            id, contrato_id, valor_previsto, valor_bruto, data_vencimento, status_manual_override, observacao, deleted_at, categoria, numero_referencia, sub_indice, juros_aplicado,
            contratos(deleted_at, agencia_id, tipo_contrato, parcelas_total, forma_pagamento, imposto_percentual, dim_agencias(nome), clientes(id, nome_cliente, empresa_label, status_cliente, link_asana, deleted_at)),
            pagamentos(valor_pago, taxa_gateway, plataforma, status_pagamento)
        `,
    )
    .is("deleted_at", null)
    .gte("data_vencimento", startDate)
    .lte("data_vencimento", endDate)
    .order("data_vencimento", { ascending: true });

  const allParcelas = (rawData ?? []) as unknown as RawParcela[];

  const classified: Row[] = allParcelas
    .filter(
      (rowP) =>
        !rowP.deleted_at &&
        !(rowP.contratos as any)?.deleted_at &&
        !(rowP.contratos as any)?.clientes?.deleted_at &&
        !STATUSES_NAO_MOSTRAR_NA_LISTA.has(rowP.status_manual_override ?? ""),
    )
    .map((rowP): Row => {
      const dl = daysLate(rowP.data_vencimento, todayStr);
      const s = rowP.status_manual_override ?? "NORMAL";
      const ct = rowP.contratos as any;
      const rawAgencia = ct?.dim_agencias;
      const agenciaNome: string | null = rawAgencia
        ? Array.isArray(rawAgencia)
          ? (rawAgencia[0]?.nome ?? null)
          : (rawAgencia.nome ?? null)
        : null;
      const pagamentoRaw = rowP.pagamentos;
      const pagamento: RawPagamento | null = Array.isArray(pagamentoRaw)
        ? (pagamentoRaw[0] ?? null)
        : (pagamentoRaw ?? null);

      let rowStatus = s as RowStatus;
      if (s === "PAGO" || s === "INADIMPLENTE RECEBIDO") {
        rowStatus = pagamento?.status_pagamento === "PROCESSANDO" ? "PROCESSANDO" : "PAGO";
      } else if (s === "PERDA DE FATURAMENTO") {
        rowStatus = "PERDA";
      } else if (s === "POSSUI PERDA" || s === "EM_PERDA_FATURAMENTO") {
        rowStatus = "EM_PERDA";
      } else if (s === "INADIMPLENTE") {
        rowStatus = "INADIMPLENTE";
      } else if (s === "POSSUI INADIMPLENCIA" || s === "EM_INADIMPLENCIA") {
        rowStatus = "EM_INADIMPLENCIA";
      } else if (s === "ATRASADO") {
        rowStatus = "ATRASADO";
      } else if (s === "NORMAL") {
        if (dl === 0) rowStatus = "VENCE_HOJE";
        else if (dl >= -3 && dl < 0) rowStatus = "VENCE_EM_BREVE";
        else rowStatus = "A_RECEBER";
      }

      return {
        ...rowP,
        rowStatus,
        daysLateVal: Math.max(0, dl),
        agenciaNome,
        pagamento,
      };
    });

  const agencias = [
    ...new Set(
      classified.map((r) => r.agenciaNome).filter(Boolean) as string[],
    ),
  ].sort();
  const categorias = [
    ...new Set(classified.map((r) => r.categoria).filter(Boolean) as string[]),
  ].sort();
  const plataformas = [
    ...new Set(
      classified
        .map((r) =>
          r.rowStatus === "PAGO" && r.pagamento?.plataforma
            ? r.pagamento.plataforma
            : (r.contratos as any)?.forma_pagamento || "—",
        )
        .filter((plat) => plat !== "—"),
    ),
  ].sort();

  const visible = classified.filter((row) => {
    if (statusFilter) {
      if (statusFilter === "pagos" && row.rowStatus !== "PAGO") return false;
      if (
        statusFilter === "a_receber" &&
        !["A_RECEBER", "VENCE_EM_BREVE", "VENCE_HOJE"].includes(row.rowStatus)
      )
        return false;
      if (statusFilter === "vence_hoje" && row.rowStatus !== "VENCE_HOJE")
        return false;
      if (statusFilter === "atrasados" && row.rowStatus !== "ATRASADO")
        return false;
      if (
        statusFilter === "inadimplentes" &&
        !["INADIMPLENTE", "EM_INADIMPLENCIA"].includes(row.rowStatus)
      )
        return false;
      if (
        statusFilter === "perda" &&
        !["PERDA", "EM_PERDA"].includes(row.rowStatus)
      )
        return false;
    }
    if (agenciaFilter && row.agenciaNome !== agenciaFilter) return false;
    if (categoriaFilter && row.categoria !== categoriaFilter) return false;

    const rowPlat =
      row.rowStatus === "PAGO" && row.pagamento?.plataforma
        ? row.pagamento.plataforma
        : (row.contratos as any)?.forma_pagamento || "—";

    if (plataformaFilter && rowPlat.toLowerCase() !== plataformaFilter)
      return false;

    if (searchFilter) {
      const ct = row.contratos as any;
      const nome = (ct?.clientes?.nome_cliente ?? "").toLowerCase();
      const emp = (ct?.clientes?.empresa_label ?? "").toLowerCase();
      if (!nome.includes(searchFilter) && !emp.includes(searchFilter))
        return false;
    }
    return true;
  });

  // ─── Mathematical Sorting ───
  if (sortCol) {
    visible.sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";

      if (sortCol === "vencimento") {
        valA = a.data_vencimento;
        valB = b.data_vencimento;
      } else if (sortCol === "plataforma") {
        valA =
          (a.rowStatus === "PAGO" && a.pagamento?.plataforma
            ? a.pagamento.plataforma
            : (a.contratos as any)?.forma_pagamento || "—") || "";
        valB =
          (b.rowStatus === "PAGO" && b.pagamento?.plataforma
            ? b.pagamento.plataforma
            : (b.contratos as any)?.forma_pagamento || "—") || "";
      } else if (sortCol === "status") {
        valA = a.rowStatus;
        valB = b.rowStatus;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }

  const kpiCount = visible.length;
  const kpiTotalBruto = visible.reduce(
    (s, r) => s + (r.valor_bruto ?? r.valor_previsto),
    0,
  );
  const kpiRecebido = visible.reduce(
    (s, r) => s + (r.rowStatus === "PAGO" ? (r.pagamento?.valor_pago ?? 0) : 0),
    0,
  );
  const kpiAtraso = visible
    .filter((r) =>
      [
        "ATRASADO",
        "INADIMPLENTE",
        "EM_INADIMPLENCIA",
        "PERDA",
        "EM_PERDA",
      ].includes(r.rowStatus),
    )
    .reduce((s, r) => s + (r.valor_bruto ?? r.valor_previsto), 0);
  const kpiAReceber = visible
    .filter((r) =>
      ["A_RECEBER", "VENCE_EM_BREVE", "VENCE_HOJE"].includes(r.rowStatus),
    )
    .reduce((s, r) => s + (r.valor_bruto ?? r.valor_previsto), 0);

  const TH =
    "py-4 px-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap select-none";
  const TD = "py-4 px-3 align-middle";

  const SortIcon = ({ column }: { column: string }) => {
    if (sortCol !== column)
      return (
        <ChevronsUpDown
          size={12}
          className="inline ml-1.5 opacity-30 group-hover:opacity-100 transition-opacity"
        />
      );
    return sortOrder === "asc" ? (
      <ChevronUp size={12} className="inline ml-1.5 text-orange-500" />
    ) : (
      <ChevronDown size={12} className="inline ml-1.5 text-orange-500" />
    );
  };

  return (
    <div className="flex flex-col gap-6 mx-auto">
      <nav className="flex items-center gap-2 text-[10px]">
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
        <span className="text-[#ffa300] font-semibold">Mesa de Operações</span>
      </nav>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
            Mesa de Operações
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            Controle e auditoria de faturas
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-[#111] border border-[#222] rounded-full p-1 h-9">
            <span className="px-4 py-1 text-[11px] font-semibold rounded-full bg-white/10 text-white shadow-sm flex items-center justify-center cursor-default">
              Mesa de Operações
            </span>
            <Link
              href={`/contas-a-receber/previsao?period=monthly&date=${y}-${String(mo).padStart(2, "0")}`}
              className="px-4 py-1 text-[11px] font-medium rounded-full text-gray-500 hover:text-white transition-all flex items-center justify-center"
            >
              Previsão
            </Link>
          </div>

          <div className="flex items-center gap-1 bg-[#111] border border-[#222] rounded-xl p-1 shadow-sm h-9">
            <Link
              href={prevMonthUrl}
              className="w-6 h-full flex items-center justify-center rounded-md text-gray-500 hover:bg-white/10 hover:text-white transition-all"
            >
              <ChevronLeft size={14} />
            </Link>
            <form method="GET" className="flex items-center gap-1.5 h-full">
              {p.status && (
                <input type="hidden" name="status" value={p.status} />
              )}
              {p.agencia && (
                <input type="hidden" name="agencia" value={p.agencia} />
              )}
              {p.categoria && (
                <input type="hidden" name="categoria" value={p.categoria} />
              )}
              {p.search && (
                <input type="hidden" name="search" value={p.search} />
              )}
              {p.plataforma && (
                <input type="hidden" name="plataforma" value={p.plataforma} />
              )}
              {p.sort && <input type="hidden" name="sort" value={p.sort} />}
              {p.order && <input type="hidden" name="order" value={p.order} />}
              <input
                type="month"
                name="month"
                defaultValue={currentMonth}
                className="bg-black border border-[#333] rounded-md px-2 py-1 text-[11px] font-bold text-white font-mono focus:outline-none focus:border-[#ffa300] [color-scheme:dark]"
              />
              <button
                type="submit"
                className="bg-[#ffa300] text-black px-3 py-1 rounded-md text-[11px] font-bold hover:bg-orange-400 transition-colors h-full"
              >
                Ir
              </button>
            </form>
            <Link
              href={nextMonthUrl}
              className="w-6 h-full flex items-center justify-center rounded-md text-gray-500 hover:bg-white/10 hover:text-white transition-all"
            >
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          icon={<Users size={14} />}
          label="Total no Filtro"
          value={`${kpiCount}`}
          color="gray"
        />
        <KpiCard
          icon={<Landmark size={14} />}
          label="Bruto Estimado"
          value={brl(kpiTotalBruto)}
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="Já Recebido"
          value={brl(kpiRecebido)}
          color="green"
        />
        <KpiCard
          icon={<Wallet size={14} />}
          label="A Receber (Prazo)"
          value={brl(kpiAReceber)}
          color="orange"
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label="Risco / Atraso"
          value={brl(kpiAtraso)}
          color="red"
        />
      </div>

      <div className="rounded-3xl bg-[#0A0A0A] border border-[#222] shadow-2xl overflow-hidden mt-2 flex flex-col">
        <OperacoesToolbar
          agencias={agencias}
          categorias={categorias}
          plataformas={plataformas}
          status={statusFilter}
          agencia={agenciaFilter}
          categoria={categoriaFilter}
          plataforma={plataformaFilter}
          search={searchFilter}
        />

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 bg-[#0A0A0A]">
            <span className="text-4xl opacity-30">📭</span>
            <span className="text-sm font-medium text-gray-500">
              Nenhuma fatura encontrada neste filtro.
            </span>
          </div>
        ) : (
          <div
            className="w-full max-h-[550px] overflow-auto relative [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-[#1A1A1A] [&::-webkit-scrollbar-thumb]:bg-[#666666] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#888888] [&::-webkit-scrollbar-corner]:bg-transparent"
            style={{
              scrollbarColor: "#666666 #1A1A1A",
              scrollbarWidth: "auto",
            }}
          >
            <table className="w-full table-fixed min-w-[1500px]">
              <thead className="sticky top-0 z-20 bg-[#050505] shadow-md">
                <tr className="border-b border-[#222]">
                  <th className={`${TH} w-[4%] pl-6 text-center`}></th>
                  <th className={`${TH} w-[19%]`}>Cliente / Empresa</th>
                  <th className={`${TH} w-[11%]`}>Contexto</th>

                  <th
                    className={`${TH} w-[10%] group cursor-pointer hover:text-white transition-colors`}
                  >
                    <Link
                      href={buildSortUrl("vencimento")}
                      className="flex items-center"
                      scroll={false}
                    >
                      Vencimento <SortIcon column="vencimento" />
                    </Link>
                  </th>

                  <th className={`${TH} w-[6%]`}>Parcela</th>

                  <th
                    className={`${TH} w-[12%] group cursor-pointer hover:text-white transition-colors`}
                  >
                    <Link
                      href={buildSortUrl("status")}
                      className="flex items-center"
                      scroll={false}
                    >
                      Status Parcela <SortIcon column="status" />
                    </Link>
                  </th>

                  <th className={`${TH} w-[8%] text-right`}>Valor Bruto</th>
                  <th className={`${TH} w-[8%] text-right pr-4`}>Recebido</th>

                  <th
                    className={`${TH} w-[10%] text-center group cursor-pointer hover:text-white transition-colors`}
                  >
                    <Link
                      href={buildSortUrl("plataforma")}
                      className="flex items-center justify-center"
                      scroll={false}
                    >
                      Plataforma <SortIcon column="plataforma" />
                    </Link>
                  </th>

                  <th className={`${TH} w-[18%] p-8`}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {visible.map((row) => {
                  const ct = row.contratos as any;
                  const cliente = ct?.clientes as RawCliente | null;
                  const clienteId = cliente?.id ?? null;
                  const isPago = row.rowStatus === "PAGO" || row.rowStatus === "PROCESSANDO";
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
                    imposto_percentual:
                      (ct?.imposto_percentual as number | null) ?? undefined,
                    status_manual_override: row.status_manual_override,
                    numero_referencia: row.numero_referencia ?? undefined,
                    sub_indice: row.sub_indice ?? undefined,
                    forma_pagamento_contrato: ct?.forma_pagamento ?? undefined,
                    data_vencimento: row.data_vencimento,
                    hasPagamento: isPago,
                    contrato_id: row.contrato_id ?? null,
                    cliente_id: clienteId,
                  };

                  const plataformaExibicao =
                    isPago && row.pagamento?.plataforma
                      ? row.pagamento.plataforma
                      : ct?.forma_pagamento || "—";

                  return (
                    <tr
                      key={row.id}
                      className={`group transition-colors hover:bg-[#111] ${isPago ? "opacity-50 hover:opacity-80" : ""}`}
                    >
                      <td className={`${TD} pl-6`}>
                        <FaturaDot rowStatus={row.rowStatus} />
                      </td>

                      <td className={TD}>
                        <div className="flex flex-col min-w-0 gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={clienteId ? `/cliente/${clienteId}` : "#"}
                              className="text-sm font-bold text-white truncate hover:text-[#ffa300] transition-colors"
                            >
                              {cliente?.nome_cliente ?? "Desconhecido"}
                            </Link>
                            {linkAsana && (
                              <a
                                href={linkAsana}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 shrink-0"
                                title="Abrir no Asana"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          {cliente?.empresa_label && (
                            <span className="text-[11px] text-gray-500 truncate">
                              {cliente.empresa_label}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className={TD}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-gray-300 font-bold uppercase tracking-wider truncate block">
                            {row.categoria ?? "—"}
                          </span>
                          <span className="text-[10px] font-medium text-gray-500 truncate block">
                            {row.agenciaNome ?? "—"}
                          </span>
                        </div>
                      </td>

                      <td className={TD}>
                        <span
                          className={`text-xs font-mono font-medium ${isPago ? "text-gray-500" : "text-gray-200"}`}
                        >
                          {fmtDate(row.data_vencimento)}
                        </span>
                      </td>

                      <td className={TD}>
                        <span className="text-[11px] text-gray-500 font-mono font-bold tracking-wider">
                          {parcelaRef}
                        </span>
                      </td>

                      <td className={TD}>
                        <StatusPill
                          status={row.rowStatus}
                          daysLateVal={row.daysLateVal}
                        />
                      </td>

                      <td className={`${TD} text-right`}>
                        <span className="text-sm font-mono font-bold text-white">
                          {brl(row.valor_bruto ?? row.valor_previsto)}
                        </span>
                      </td>

                      <td className={`${TD} text-right pr-4`}>
                        <span
                          className={`text-sm font-mono font-bold ${isPago ? "text-[#34C759]" : "text-gray-600"}`}
                        >
                          {isPago ? brl(row.pagamento?.valor_pago || 0) : "—"}
                        </span>
                      </td>

                      <td className={`${TD} text-center`}>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg inline-block whitespace-nowrap ${isPago ? "text-gray-400 bg-white/[0.05] border border-white/10" : "text-gray-500 bg-white/[0.02] border border-white/5"}`}
                        >
                          {plataformaExibicao}
                        </span>
                      </td>

                      <td className={`${TD} text-right pr-6`}>
                        <ParcelaActions parcela={parcelaData} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-[#050505] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)]">
                <tr className="border-t border-[#222]">
                  <td
                    colSpan={6}
                    className="pl-6 py-5 text-[11px] text-gray-500 uppercase tracking-widest font-bold"
                  >
                    Totais da Visualização ({visible.length})
                  </td>
                  <td className="px-3 py-5 text-right font-mono font-bold text-white text-sm">
                    {brl(kpiTotalBruto)}
                  </td>
                  <td className="px-4 py-5 text-right font-mono font-bold text-[#34C759] text-sm">
                    {kpiRecebido > 0 ? brl(kpiRecebido) : "—"}
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
