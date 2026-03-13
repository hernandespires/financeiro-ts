import Link from "next/link";
import {
    Table2,
    BarChart2,
    Users,
    UserPlus,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Wallet,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { brl, toDateStr, daysLate } from "@/lib/utils";
import { syncFinanceStatuses, getRiskStatus } from "@/lib/financeRules";

export default async function HomePage() {
    const todayStr = toDateStr(new Date());
    const currentMonth = todayStr.slice(0, 7);
    const [y, mo] = currentMonth.split("-").map(Number);
    const startDate = `${currentMonth}-01`;
    const endDate = `${currentMonth}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;

    await syncFinanceStatuses(supabaseAdmin);

    // ── Real KPIs ──────────────────────────────────────────────────────────────
    const { data: parcelas } = await supabaseAdmin
        .from("parcelas")
        .select("data_vencimento, status_manual_override, valor_previsto, deleted_at, contratos!inner(deleted_at, clientes!inner(deleted_at))")
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lte("data_vencimento", endDate);

    let totalPrevisto = 0;
    let totalRecebido = 0;
    let totalAtrasado = 0;
    let totalInadimplente = 0;

    for (const p of (parcelas ?? []) as any[]) {
        if (p.contratos?.deleted_at || p.contratos?.clientes?.deleted_at) continue;
        const s = p.status_manual_override ?? "NORMAL";
        const v = p.valor_previsto ?? 0;
        if (s === "PAGO" || s === "INADIMPLENTE RECEBIDO") { totalRecebido += v; continue; }
        if (s === "RENOVAR CONTRATO" || s === "RENOVADO" || s === "FINALIZAR PROJETO" || s === "QUEBRA DE CONTRATO" || s === "CONTRATO À VISTA") continue;
        const dl = daysLate(p.data_vencimento, todayStr);
        const risk = getRiskStatus(dl);
        if (risk === "PERDA" || risk === "INADIMPLENTE") { totalInadimplente += v; continue; }
        if (risk === "ATRASO") { totalAtrasado += v; continue; }
        totalPrevisto += v;
    }

    // ── Clientes count ─────────────────────────────────────────────────────────
    const { count: totalClientes } = await supabaseAdmin
        .from("clientes")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);

    // ── Vence hoje ─────────────────────────────────────────────────────────────
    const venceHoje = (parcelas ?? []).filter((p: any) =>
        p.data_vencimento === todayStr &&
        p.status_manual_override === "NORMAL" &&
        !p.contratos?.deleted_at &&
        !p.contratos?.clientes?.deleted_at
    ).length;

    const formattedDate = new Date(todayStr + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

    return (
        <div className="flex flex-col gap-6">

            {/* ── Greeting ── */}
            <div className="flex items-end justify-between">
                <div>
                    <p className="text-[11px] text-gray-600 uppercase tracking-widest font-medium capitalize">
                        {formattedDate}
                    </p>
                    <h1 className="text-2xl font-black text-white mt-1 tracking-tight">
                        Visão Geral
                    </h1>
                </div>
                <Link
                    href="/contas-a-receber/lista"
                    className="flex items-center gap-1.5 text-[11px] text-[#ffa300] hover:text-white transition-colors font-semibold"
                >
                    Mesa de operações <ArrowRight size={13} />
                </Link>
            </div>

            {/* ── KPI Strip ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

                <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[100px] hover:border-[#34C759]/30 transition-all">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#34C759]">
                        <TrendingUp size={12} /> A Receber (mês)
                    </div>
                    <span className="text-2xl font-black text-white leading-none tracking-tight">{brl(totalPrevisto)}</span>
                </div>

                <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[100px] hover:border-[#ffa300]/30 transition-all">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ffa300]">
                        <Wallet size={12} /> Recebido (mês)
                    </div>
                    <span className="text-2xl font-black text-white leading-none tracking-tight">{brl(totalRecebido)}</span>
                </div>

                <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[100px] hover:border-[#FF9500]/30 transition-all">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#FF9500]">
                        <TrendingDown size={12} /> Em Atraso
                    </div>
                    <span className="text-2xl font-black text-white leading-none tracking-tight">{brl(totalAtrasado)}</span>
                </div>

                <div className="flex flex-col justify-between rounded-2xl bg-[#0A0A0A] border border-white/[0.06] p-5 min-h-[100px] hover:border-[#FF453A]/30 transition-all">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#FF453A]">
                        <AlertTriangle size={12} /> Inadimplência
                    </div>
                    <span className="text-2xl font-black text-white leading-none tracking-tight">{brl(totalInadimplente)}</span>
                </div>
            </div>

            {/* ── Quick info bar ── */}
            <div className="flex items-center gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] px-6 py-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Vence Hoje</span>
                    <span className="text-xl font-black text-[#FFD60A] mt-0.5">{venceHoje} parcela{venceHoje !== 1 ? "s" : ""}</span>
                </div>
                <div className="w-px h-10 bg-white/[0.06]" />
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Clientes Ativos</span>
                    <span className="text-xl font-black text-white mt-0.5">{totalClientes ?? 0}</span>
                </div>
                <div className="flex-1" />
                <Link
                    href={`/contas-a-receber?date=${todayStr}`}
                    className="text-[11px] text-[#ffa300] hover:text-white transition-colors font-semibold flex items-center gap-1"
                >
                    Ver agenda do dia <ArrowRight size={12} />
                </Link>
            </div>

            {/* ── Navigation cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

                <Link
                    href="/contas-a-receber/lista"
                    className="group flex flex-col gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] hover:border-[#ffa300]/30 p-6 transition-all duration-200 hover:bg-[#ffa300]/[0.03]"
                >
                    <div className="w-10 h-10 rounded-xl bg-[#ffa300]/10 flex items-center justify-center group-hover:bg-[#ffa300]/20 transition-colors">
                        <Table2 size={20} className="text-[#ffa300]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white group-hover:text-[#ffa300] transition-colors leading-tight">
                            Mesa de Operações
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                            Gerencie e dê baixa nas parcelas do mês
                        </p>
                    </div>
                    <ArrowRight size={14} className="text-gray-600 group-hover:text-[#ffa300] transition-colors mt-auto" />
                </Link>

                <Link
                    href="/contas-a-receber/previsao"
                    className="group flex flex-col gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] hover:border-[#34C759]/30 p-6 transition-all duration-200 hover:bg-[#34C759]/[0.02]"
                >
                    <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center group-hover:bg-[#34C759]/20 transition-colors">
                        <BarChart2 size={20} className="text-[#34C759]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white group-hover:text-[#34C759] transition-colors leading-tight">
                            Previsão de Caixa
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                            Projeções mensais e anuais de recebimento
                        </p>
                    </div>
                    <ArrowRight size={14} className="text-gray-600 group-hover:text-[#34C759] transition-colors mt-auto" />
                </Link>

                <Link
                    href="/consultar-clientes"
                    className="group flex flex-col gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] hover:border-blue-400/30 p-6 transition-all duration-200 hover:bg-blue-500/[0.02]"
                >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <Users size={20} className="text-blue-400" strokeWidth={1.8} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                            Clientes
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                            Consulte e gerencie sua carteira de clientes
                        </p>
                    </div>
                    <ArrowRight size={14} className="text-gray-600 group-hover:text-blue-400 transition-colors mt-auto" />
                </Link>

                <Link
                    href="/cadastro"
                    className="group flex flex-col gap-4 rounded-2xl bg-[#0A0A0A] border border-white/[0.06] hover:border-purple-400/30 p-6 transition-all duration-200 hover:bg-purple-500/[0.02]"
                >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                        <UserPlus size={20} className="text-purple-400" strokeWidth={1.8} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors leading-tight">
                            Novo Cliente
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                            Registre um novo cliente e contrato
                        </p>
                    </div>
                    <ArrowRight size={14} className="text-gray-600 group-hover:text-purple-400 transition-colors mt-auto" />
                </Link>

            </div>

        </div>
    );
}
