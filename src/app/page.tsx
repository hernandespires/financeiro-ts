import Link from "next/link";
import {
  Wallet,
  FileText,
  CreditCard,
  LineChart,
  Bell,
  Calendar,
  Building,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";

// ── Mock bar-chart data ──────────────────────────────────────────────────────
const chartBars = [
  { month: "Jan", h: 55 },
  { month: "Fev", h: 70 },
  { month: "Mar", h: 40 },
  { month: "Abr", h: 80 },
  { month: "Mai", h: 60 },
  { month: "Jun", h: 90 },
  { month: "Jul", h: 50 },
  { month: "Ago", h: 75 },
  { month: "Set", h: 45 },
  { month: "Out", h: 85 },
  { month: "Nov", h: 65 },
  { month: "Dez", h: 95 },
];

// ── Mock transactions ────────────────────────────────────────────────────────
const transactions = [
  { id: 1, time: "Às 14:44 | 26/02/2026" },
  { id: 2, time: "Às 14:44 | 26/02/2026" },
  { id: 3, time: "Às 14:44 | 26/02/2026" },
];

// ── Shortcut cards ────────────────────────────────────────────────────────────
const shortcuts = [
  { label: "Relatório mensal", icon: LineChart },
  { label: "Alertas financeiros", icon: Bell },
  { label: "Projeções anuais", icon: Calendar },
  { label: "Centro de custos", icon: Building },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">

      {/* ══════════════════════════════════════════════
          TOP — Metrics + Quick Actions
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* LEFT — Metric cards */}
        <div className="grid grid-cols-3 gap-4">

          {/* Saldo em conta */}
          <div className="flex flex-col justify-between rounded-2xl bg-[#FFA300] p-5 min-h-[120px]">
            <span className="text-xs font-semibold text-black/70 uppercase tracking-wide">
              Saldo em conta
            </span>
            <div>
              <p className="text-2xl font-extrabold text-black leading-tight">
                R$ 000,00
              </p>
              <p className="flex items-center gap-1 text-xs text-black/60 mt-1 font-medium">
                <TrendingUp size={12} /> +2%{" "}
                <span className="font-normal">(Neste mês)</span>
              </p>
            </div>
          </div>

          {/* A receber */}
          <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[120px]">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              A receber
            </span>
            <div>
              <p className="text-2xl font-extrabold text-green-400 leading-tight">
                R$ 000,00
              </p>
              <p className="flex items-center gap-1 text-xs text-gray-500 mt-1 font-medium">
                <TrendingUp size={12} className="text-green-400" /> +3%{" "}
                <span className="font-normal">(Neste mês)</span>
              </p>
            </div>
          </div>

          {/* A pagar */}
          <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[120px]">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              A pagar
            </span>
            <div>
              <p className="text-2xl font-extrabold text-red-400 leading-tight">
                R$ 000,00
              </p>
              <p className="flex items-center gap-1 text-xs text-gray-500 mt-1 font-medium">
                <TrendingDown size={12} className="text-red-400" /> -1,3%{" "}
                <span className="font-normal">(Neste mês)</span>
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — Quick action buttons */}
        <div className="grid grid-cols-3 gap-4">

          <Link
            href="/contas-a-receber"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#FFA300] hover:bg-[#e6930d] active:bg-[#cc8200] transition-colors p-5 min-h-[120px] cursor-pointer"
          >
            <Wallet size={28} strokeWidth={1.8} className="text-black" />
            <span className="text-xs font-bold text-black text-center leading-tight">
              Contas a receber
            </span>
          </Link>

          <Link
            href="/contas-a-pagar"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#FFA300] hover:bg-[#e6930d] active:bg-[#cc8200] transition-colors p-5 min-h-[120px] cursor-pointer"
          >
            <FileText size={28} strokeWidth={1.8} className="text-black" />
            <span className="text-xs font-bold text-black text-center leading-tight">
              Contas a pagar
            </span>
          </Link>

          <Link
            href="/cartoes"
            className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#FFA300] hover:bg-[#e6930d] active:bg-[#cc8200] transition-colors p-5 min-h-[120px] cursor-pointer"
          >
            <CreditCard size={28} strokeWidth={1.8} className="text-black" />
            <span className="text-xs font-bold text-black text-center leading-tight">
              Cartões
            </span>
          </Link>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MIDDLE — Chart + Transactions
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">

        {/* LEFT — Bar chart */}
        <div className="flex flex-col rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-6">
          <h2 className="text-base font-bold text-[#FFA300] mb-6">
            Métricas do Financeiro
          </h2>

          {/* Chart area */}
          <div className="flex-1 flex items-end gap-2 min-h-[160px]">
            {chartBars.map((bar) => (
              <div key={bar.month} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className="w-full rounded-t-lg bg-[#FFA300] hover:bg-[#e6930d] transition-all duration-300"
                  style={{ height: `${bar.h}%`, minHeight: "16px" }}
                />
                <span className="text-[10px] text-gray-500 font-medium">
                  {bar.month}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom button */}
          <div className="mt-6 flex justify-center">
            <button className="text-xs text-gray-400 hover:text-[#FFA300] transition-colors flex items-center gap-1 underline-offset-4 hover:underline">
              ↓ Ver todas as métricas
            </button>
          </div>
        </div>

        {/* RIGHT — Transactions */}
        <div className="flex flex-col rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-6">
          <h2 className="text-base font-bold text-[#FFA300] mb-5">
            Últimas transações
          </h2>

          <div className="flex flex-col gap-4 flex-1">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 pb-4 border-b border-white/5 last:border-0 last:pb-0"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#FFA300]/20 border border-[#FFA300]/40 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[#FFA300]">C</span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white leading-snug">
                    <span className="font-semibold">Colaborador</span> realizou
                    um{" "}
                    <span className="text-[#FFA300] font-semibold">
                      pagamento
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{tx.time}</p>
                </div>

                {/* Link */}
                <Link
                  href="#"
                  className="text-xs text-[#FFA300] hover:text-[#e6930d] font-semibold shrink-0 flex items-center gap-0.5 transition-colors"
                >
                  Ver <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>

          {/* Bottom button */}
          <div className="mt-5 flex justify-center">
            <button className="text-xs text-gray-400 hover:text-[#FFA300] transition-colors flex items-center gap-1 underline-offset-4 hover:underline">
              ↓ Ver todas as transações
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          BOTTOM — Shortcuts
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {shortcuts.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="flex items-center gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] hover:border-[#FFA300]/40 p-5 transition-all duration-200 group text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[#FFA300]/10 flex items-center justify-center shrink-0 group-hover:bg-[#FFA300]/20 transition-colors">
              <Icon size={20} className="text-[#FFA300]" strokeWidth={1.8} />
            </div>
            <span className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors leading-tight">
              {label}
            </span>
          </button>
        ))}
      </div>

    </div>
  );
}
