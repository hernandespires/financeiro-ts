import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Building2, CalendarClock, TrendingDown } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import ParcelaActions from "@/components/ParcelaActions";
import RiskBadge, { riskConfig, RiskStatus } from "@/components/RiskBadge";
import { brl, toDateStr, daysLate, fmtDate } from "@/lib/utils";


// ─── Parcel status badge ──────────────────────────────────────────────────────
function ParcelBadge({
    status,
    dueDate,
    todayStr,
}: {
    status: string;
    dueDate: string;
    todayStr: string;
}) {
    if (status === "PAGO") {
        return (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-green-500/10 text-green-400 border border-green-500/20">
                PAGO
            </span>
        );
    }

    if (status === "RENOVAR CONTRATO") {
        return (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-purple-500/10 text-purple-400 border border-purple-500/20">
                RENOVAR
            </span>
        );
    }

    // NORMAL — check if late
    const late = daysLate(dueDate, todayStr);
    if (late > 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-red-500/10 text-red-400 border border-red-500/20">
                <TrendingDown size={10} />
                {late}d atraso
            </span>
        );
    }

    return (
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-orange-500/10 text-orange-400 border border-orange-500/20">
            ABERTO
        </span>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function ClienteDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const todayStr = toDateStr(new Date());

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const { data: clientData, error } = await supabaseAdmin
        .from("clientes")
        .select(
            `id, nome_cliente, empresa_label, cnpj_contrato, telefone, segmento, created_at,
             contratos(
               id, tipo_contrato, valor_total_contrato, parcelas_total, periodicidade,
               parcelas(id, data_vencimento, valor_previsto, status_manual_override, observacao, tipo_parcela, numero_referencia, sub_indice)
             )`
        )
        .eq("id", id)
        .single();

    if (error || !clientData) {
        console.error("[ClienteDetail] error:", error?.message);
        notFound();
    }

    // ── Type narrowing ────────────────────────────────────────────────────────
    const cliente = clientData as {
        id: string;
        nome_cliente: string;
        empresa_label: string | null;
        cnpj_contrato: string | null;
        telefone: string | null;
        segmento: string | null;
        created_at: string;
        contratos: {
            id: string;
            tipo_contrato: string | null;
            valor_total_contrato: number;
            parcelas_total: number;
            periodicidade: string | null;
            parcelas: {
                id: string;
                data_vencimento: string;
                valor_previsto: number;
                status_manual_override: string;
                observacao: string | null;
                tipo_parcela: string | null;
                numero_referencia: number;
                sub_indice: number | null;
            }[];
        }[];
    };

    const contratos = cliente.contratos ?? [];

    // ── Cross-default risk ────────────────────────────────────────────────────
    const openParcelas = contratos.flatMap((ct) =>
        (ct.parcelas ?? []).filter((p) => p.status_manual_override === "NORMAL")
    );

    let riskStatus: RiskStatus = "CONCLUÍDO";
    if (openParcelas.length > 0) {
        const maxLate = Math.max(
            ...openParcelas.map((p) => daysLate(p.data_vencimento, todayStr))
        );
        if (maxLate > 30) riskStatus = "PERDA";
        else if (maxLate >= 15) riskStatus = "INADIMPLENTE";
        else if (maxLate >= 1) riskStatus = "ATRASO";
        else riskStatus = "EM DIA";
    }


    const valorTotalAtivo = contratos.reduce(
        (s, ct) => s + (ct.valor_total_contrato ?? 0), 0
    );

    // ── Flat sorted parcel list with index info ───────────────────────────────
    type FlatParcela = {
        id: string;
        data_vencimento: string;
        valor_previsto: number;
        status_manual_override: string;
        observacao: string | null;
        tipo_parcela: string | null;
        numero_referencia: number;
        sub_indice: number | null;
        contratoId: string;
        tipoContrato: string | null;
        index: number;
        total: number;
    };

    const allParcelas: FlatParcela[] = contratos.flatMap((ct) =>
        (ct.parcelas ?? [])
            .slice()
            .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
            .map((p, i) => ({
                ...p,
                contratoId: ct.id,
                tipoContrato: ct.tipo_contrato,
                index: i + 1,
                total: ct.parcelas_total ?? ct.parcelas.length,
            }))
    );

    // Sort globally by due date
    allParcelas.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-8">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs">
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                    Dashboard
                </Link>
                <span className="text-gray-600">/</span>
                <Link href="/consultar-clientes" className="text-gray-400 hover:text-white transition-colors">
                    Consultar Clientes
                </Link>
                <span className="text-gray-600">/</span>
                <span className="text-orange-500 font-semibold">Ficha do Cliente</span>
            </nav>

            {/* Back button */}
            <Link
                href="/consultar-clientes"
                className="self-start flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500 text-gray-400 hover:text-orange-400 px-4 py-2 text-xs font-medium transition-all"
            >
                <ChevronLeft size={14} />
                Voltar para clientes
            </Link>

            {/* Profile Hero Card */}
            <div
                className={`rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 p-8 ${riskConfig[riskStatus].glow} transition-shadow duration-300`}
            >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">

                    {/* Left: Identity */}
                    <div className="flex flex-col gap-3">
                        {/* Risk badge */}
                        <RiskBadge status={riskStatus} size="lg" />

                        <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
                            {cliente.nome_cliente}
                        </h1>

                        {cliente.empresa_label && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Building2 size={14} />
                                {cliente.empresa_label}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-4 mt-1">
                            {cliente.segmento && (
                                <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-0.5 font-semibold">
                                    {cliente.segmento}
                                </span>
                            )}
                            {cliente.cnpj_contrato && (
                                <span className="text-xs text-gray-500">
                                    CNPJ/EIN: {cliente.cnpj_contrato}
                                </span>
                            )}
                            {cliente.telefone && (
                                <span className="text-xs text-gray-500">
                                    {cliente.telefone}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right: KPI summary */}
                    <div className="flex sm:flex-col gap-6 sm:gap-4 sm:text-right shrink-0">
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">
                                Valor Total Ativo
                            </p>
                            <p className="text-2xl font-black text-orange-500 leading-none">
                                {brl(valorTotalAtivo)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">
                                Contratos
                            </p>
                            <p className="text-2xl font-black text-white leading-none">
                                {contratos.length}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">
                                Cliente desde
                            </p>
                            <p className="text-sm font-semibold text-gray-300">
                                {new Date(cliente.created_at).toLocaleDateString("pt-BR", {
                                    month: "short",
                                    year: "numeric",
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contract summary pills */}
            {contratos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    {contratos.map((ct) => (
                        <div
                            key={ct.id}
                            className="flex items-center gap-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2.5"
                        >
                            <CalendarClock size={13} className="text-orange-400 shrink-0" />
                            <div className="text-xs leading-tight">
                                <p className="text-orange-400 font-semibold">
                                    {ct.tipo_contrato ?? "—"}
                                </p>
                                <p className="text-gray-500">
                                    {ct.periodicidade} · {ct.parcelas_total} parcelas · {brl(ct.valor_total_contrato)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Invoices Table */}
            <div className="rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 overflow-hidden">

                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-bold text-white">
                        Histórico de Faturas
                    </h2>
                    <p className="text-xs text-gray-500">
                        {allParcelas.length} parcela{allParcelas.length !== 1 ? "s" : ""}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    #
                                </th>
                                <th className="text-left px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Tipo / Obs.
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Vencimento
                                </th>
                                <th className="text-right px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Valor
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Status
                                </th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                    Ação
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {allParcelas.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="text-center py-14 text-gray-600 text-sm"
                                    >
                                        <span className="text-3xl block mb-2">📭</span>
                                        Nenhuma parcela encontrada para este cliente.
                                    </td>
                                </tr>
                            ) : (
                                allParcelas.map((p) => {
                                    const isPago = p.status_manual_override === "PAGO";
                                    const isActionable = p.status_manual_override === "NORMAL";

                                    return (
                                        <tr
                                            key={p.id}
                                            className={`border-b border-white/5 last:border-0 transition-colors ${isPago
                                                ? "opacity-50 hover:opacity-70"
                                                : "hover:bg-white/[0.03]"
                                                }`}
                                        >
                                            {/* # parcela */}
                                            <td className="px-6 py-3.5">
                                                <span className="text-xs font-mono text-gray-400">
                                                    {p.numero_referencia}
                                                    {p.sub_indice != null && p.sub_indice > 0 && (
                                                        <span className="text-orange-400">-{p.sub_indice}</span>
                                                    )}
                                                </span>
                                            </td>

                                            {/* Tipo / Obs */}
                                            <td className="px-6 py-3.5">
                                                <p className="text-xs font-medium text-orange-400">
                                                    {p.tipo_parcela ?? p.tipoContrato ?? "—"}
                                                </p>
                                                {p.observacao && (
                                                    <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[180px]">
                                                        {p.observacao}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Vencimento */}
                                            <td className="px-6 py-3.5 text-center">
                                                <span
                                                    className={`text-xs font-medium ${!isPago &&
                                                        daysLate(p.data_vencimento, todayStr) > 0
                                                        ? "text-red-400"
                                                        : "text-gray-300"
                                                        }`}
                                                >
                                                    {fmtDate(p.data_vencimento)}
                                                </span>
                                            </td>

                                            {/* Valor */}
                                            <td className="px-6 py-3.5 text-right">
                                                <span className="text-sm font-semibold text-white">
                                                    {brl(p.valor_previsto)}
                                                </span>
                                            </td>

                                            {/* Status badge */}
                                            <td className="px-6 py-3.5 text-center">
                                                <ParcelBadge
                                                    status={p.status_manual_override}
                                                    dueDate={p.data_vencimento}
                                                    todayStr={todayStr}
                                                />
                                            </td>

                                            {/* Action */}
                                            <td className="px-6 py-3.5 text-center">
                                                <ParcelaActions parcela={p} />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
