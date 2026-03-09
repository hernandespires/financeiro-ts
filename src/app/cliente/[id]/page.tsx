import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { ChevronLeft, Building2, CalendarClock, TrendingDown, Activity, MessageSquare } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import ParcelaActions from "@/components/ParcelaActions";
import CommentForm from "@/components/CommentForm";
import RiskBadge, { riskConfig, RiskStatus } from "@/components/RiskBadge";
import ClienteActions from "@/components/ClienteActions";
import RestaurarParcelaBtn from "@/components/RestaurarParcelaBtn";
import { brl, toDateStr, daysLate, fmtDate } from "@/lib/utils";
import { getRiskStatus } from "@/lib/financeRules";


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
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const { id } = await params;
    const { tab } = await searchParams;
    const activeTab = tab || "financeiro";
    const todayStr = toDateStr(new Date());

    // ── Auth + role ───────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseSSR = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); } } }
    );
    const { data: { user } } = await supabaseSSR.auth.getUser();
    if (!user) redirect('/login');

    const { data: dbUser } = await supabaseAdmin
        .from('usuarios').select('cargo').eq('id', user.id).single();
    const isAdmin = dbUser?.cargo === 'ADMIN' || dbUser?.cargo === 'DIRETOR';

    // ── Parallel Fetch ────────────────────────────────────────────────────────
    const [clientRes, comentariosRes, logsRes] = await Promise.all([
        supabaseAdmin
            .from("clientes")
            .select(
                `id, nome_cliente, empresa_label, cnpj_contrato, telefone, segmento, created_at,
                 aniversario, pais, estado, cidade, link_asana, deleted_at,
                 contratos(
                   id, tipo_contrato, valor_total_contrato, parcelas_total, periodicidade, forma_pagamento,
                   cnpj_vinculado,
                   dim_agencias(nome), dim_equipe_sdr:dim_equipe!sdr_id(nome), dim_equipe_closer:dim_equipe!closer_id(nome),
                   dim_programas:dim_programas!programa_id(nome),
                   parcelas(id, data_vencimento, valor_previsto, status_manual_override, observacao, tipo_parcela, numero_referencia, sub_indice, deleted_at, pagamentos(data_pagamento))
                 )`
            )
            .eq("id", id)
            .single(),
        supabaseAdmin
            .from('comentarios_clientes')
            .select('*, usuarios(nome, avatar_url, cargo)')
            .eq('cliente_id', id)
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('atividades_log')
            .select('*')
            .eq('registro_id', id)
            .order('created_at', { ascending: false }),
    ]);

    if (clientRes.error || !clientRes.data) {
        console.error("[ClienteDetail] error:", clientRes.error?.message);
        notFound();
    }

    const clientData = clientRes.data;

    type Comentario = {
        id: string;
        created_at: string;
        comentario: string;
        usuario_id: string | null;
        usuarios: {
            nome: string | null;
            avatar_url: string | null;
            cargo: string | null;
        } | null;
    };

    const comentarios: Comentario[] = (comentariosRes.data || []) as Comentario[];
    const logs = logsRes.data || [];

    // ── Type narrowing ────────────────────────────────────────────────────────
    const cliente = (clientData as unknown) as {
        id: string;
        nome_cliente: string;
        empresa_label: string | null;
        cnpj_contrato: string | null;
        telefone: string | null;
        segmento: string | null;
        created_at: string;
        aniversario: string | null;
        pais: string | null;
        estado: string | null;
        cidade: string | null;
        link_asana: string | null;
        deleted_at: string | null;
        contratos: {
            id: string;
            tipo_contrato: string | null;
            valor_total_contrato: number;
            parcelas_total: number;
            periodicidade: string | null;
            cnpj_vinculado: string | null;
            // Supabase returns FK joins as arrays
            dim_agencias: { nome: string }[] | { nome: string } | null;
            dim_equipe_sdr: { nome: string }[] | { nome: string } | null;
            dim_equipe_closer: { nome: string }[] | { nome: string } | null;
            dim_programas: { nome: string }[] | { nome: string } | null;
            parcelas: {
                id: string;
                data_vencimento: string;
                valor_previsto: number;
                status_manual_override: string;
                observacao: string | null;
                tipo_parcela: string | null;
                numero_referencia: number;
                sub_indice: number | null;
                deleted_at: string | null;
                pagamentos: { data_pagamento: string }[];
            }[];
        }[];
    };

    const contratos = cliente.contratos ?? [];
    const primeiroContrato = contratos[0] ?? null;

    // Safe extractor for Supabase FK joins (may return array or object)
    const extractName = (obj: any): string | null => {
        if (!obj) return null;
        if (Array.isArray(obj)) return (obj[0] as any)?.nome ?? null;
        return (obj as any).nome ?? null;
    };

    const agencia = extractName(primeiroContrato?.dim_agencias);
    const sdr = extractName(primeiroContrato?.dim_equipe_sdr);
    const closer = extractName(primeiroContrato?.dim_equipe_closer);
    const programaFechado = extractName(primeiroContrato?.dim_programas);

    // ── Cross-default risk ────────────────────────────────────────────────────
    const openParcelas = contratos.flatMap((ct) =>
        (ct.parcelas ?? []).filter((p) => p.status_manual_override === "NORMAL")
    );

    let riskStatus: RiskStatus = "CONCLUÍDO";
    if (openParcelas.length > 0) {
        const maxLate = Math.max(
            ...openParcelas.map((p) => daysLate(p.data_vencimento, todayStr))
        );
        // Use central brain — matches financeRules thresholds exactly
        riskStatus = getRiskStatus(maxLate) as RiskStatus;
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
        deleted_at: string | null;
        contratoId: string;
        tipoContrato: string | null;
        forma_pagamento_contrato: string | null;
        index: number;
        total: number;
        dataPagamento: string | null;  // from pagamentos join
        hasPagamento: boolean;         // true = pagamentos record exists
    };

    const allParcelas: FlatParcela[] = contratos.flatMap((ct) =>
        (ct.parcelas ?? [])
            .filter((p) => isAdmin ? true : !p.deleted_at)  // admins see soft-deleted rows
            .slice()
            .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
            .map((p, i) => {
                const pags = p.pagamentos as unknown;
                const dataPagamento = Array.isArray(pags)
                    ? ((pags as { data_pagamento: string }[])[0]?.data_pagamento ?? null)
                    : ((pags as { data_pagamento: string } | null)?.data_pagamento ?? null);
                return {
                    ...p,
                    contratoId: ct.id,
                    tipoContrato: ct.tipo_contrato,
                    forma_pagamento_contrato: (ct as any).forma_pagamento ?? null,
                    index: i + 1,
                    total: ct.parcelas_total ?? ct.parcelas.length,
                    dataPagamento,
                    hasPagamento: dataPagamento !== null,
                };
            })
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

            {/* Back button + Client action buttons */}
            <div className="flex items-center justify-between gap-4">
                <Link
                    href="/consultar-clientes"
                    className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500 text-gray-400 hover:text-orange-400 px-4 py-2 text-xs font-medium transition-all shrink-0"
                >
                    <ChevronLeft size={14} />
                    Voltar para clientes
                </Link>
                <ClienteActions
                    clienteId={cliente.id}
                    isAdmin={isAdmin}
                    // ClienteEditData fields:
                    nome_cliente={cliente.nome_cliente}
                    empresa_label={cliente.empresa_label}
                    cnpj_contrato={cliente.cnpj_contrato}
                    telefone={cliente.telefone}
                    aniversario={cliente.aniversario}
                    pais={cliente.pais}
                    estado={cliente.estado}
                    cidade={cliente.cidade}
                    segmento={cliente.segmento}
                    link_asana={cliente.link_asana}
                    contratoId={primeiroContrato?.id ?? null}
                    valorTotalContrato={primeiroContrato?.valor_total_contrato ?? null}
                    agencia={agencia}
                    sdr={sdr}
                    closer={closer}
                    cnpjVinculado={primeiroContrato?.cnpj_vinculado ?? null}
                    programaFechado={programaFechado}
                    isDeleted={!!cliente.deleted_at}
                />
            </div>

            {/* Profile Hero Card */}
            <div
                className={`rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl p-8 ${riskConfig[riskStatus].glow} transition-shadow duration-300`}
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
                            className="flex items-center gap-3 rounded-xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl px-4 py-2.5"
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

            {/* Tabs + Invoices / CRM Panel */}
            <div className="rounded-2xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">

                {/* Tab header */}
                <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/10">
                    <Link
                        href={`?tab=financeiro`}
                        scroll={false}
                        className={`text-sm font-bold px-4 py-3 -mb-px transition-colors border-b-2 ${activeTab === 'financeiro'
                            ? 'text-orange-500 border-orange-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'
                            }`}
                    >
                        Histórico Financeiro
                    </Link>
                    <Link
                        href={`?tab=crm`}
                        scroll={false}
                        className={`text-sm font-bold px-4 py-3 -mb-px transition-colors border-b-2 ${activeTab === 'crm'
                            ? 'text-orange-500 border-orange-500'
                            : 'text-gray-500 border-transparent hover:text-gray-300'
                            }`}
                    >
                        CRM & Histórico
                    </Link>
                    {/* right: parcel count (only in financeiro) */}
                    {activeTab === 'financeiro' && (
                        <p className="ml-auto text-xs text-gray-500">
                            {allParcelas.length} parcela{allParcelas.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>

                {activeTab === 'financeiro' && (
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
                                    <th className="text-center px-6 py-3 text-[10px] font-semibold text-orange-500 uppercase tracking-widest">
                                        Pagamento
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
                                            colSpan={7}
                                            className="text-center py-14 text-gray-600 text-sm"
                                        >
                                            <span className="text-3xl block mb-2">📭</span>
                                            Nenhuma parcela encontrada para este cliente.
                                        </td>
                                    </tr>
                                ) : (
                                    allParcelas.map((p) => {
                                        const isDeleted = !!p.deleted_at;
                                        const isPago = p.status_manual_override === "PAGO";

                                        return (
                                            <tr
                                                key={p.id}
                                                className={`border-b border-white/5 last:border-0 transition-colors ${isDeleted
                                                    ? "opacity-40 bg-red-500/5"
                                                    : isPago
                                                        ? "opacity-50 hover:opacity-70"
                                                        : "hover:bg-white/[0.03]"
                                                    }`}
                                            >
                                                {/* # parcela */}
                                                <td className="px-6 py-3.5">
                                                    <span className={`text-xs font-mono ${isDeleted ? "line-through text-red-400" : "text-gray-400"}`}>
                                                        {p.numero_referencia}
                                                        {p.sub_indice != null && p.sub_indice > 0 && (
                                                            <span className="text-orange-400">-{p.sub_indice}</span>
                                                        )}
                                                    </span>
                                                </td>

                                                {/* Tipo / Obs */}
                                                <td className="px-6 py-3.5">
                                                    <p className={`text-xs font-medium ${isDeleted ? "line-through text-red-400/70" : "text-orange-400"}`}>
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
                                                        className={`text-xs font-medium ${isDeleted
                                                            ? "line-through text-red-400/60"
                                                            : !isPago && daysLate(p.data_vencimento, todayStr) > 0
                                                                ? "text-red-400"
                                                                : "text-gray-300"
                                                            }`}
                                                    >
                                                        {fmtDate(p.data_vencimento)}
                                                    </span>
                                                </td>

                                                {/* Pagamento */}
                                                <td className="px-6 py-3.5 text-center">
                                                    {p.dataPagamento ? (
                                                        <span className="text-xs font-medium text-green-400">
                                                            {fmtDate(p.dataPagamento)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-600">—</span>
                                                    )}
                                                </td>

                                                {/* Valor */}
                                                <td className="px-6 py-3.5 text-right">
                                                    <span className={`text-sm font-semibold ${isDeleted ? "line-through text-red-400/60" : "text-white"}`}>
                                                        {brl(p.valor_previsto)}
                                                    </span>
                                                </td>

                                                {/* Status badge */}
                                                <td className="px-6 py-3.5 text-center">
                                                    {isDeleted ? (
                                                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-red-500/10 text-red-400 border border-red-500/30">
                                                            EXCLUÍDA
                                                        </span>
                                                    ) : (
                                                        <ParcelBadge
                                                            status={p.status_manual_override}
                                                            dueDate={p.data_vencimento}
                                                            todayStr={todayStr}
                                                        />
                                                    )}
                                                </td>

                                                {/* Action — disabled for deleted rows */}
                                                <td className="px-6 py-3.5 text-center">
                                                    {isDeleted ? (
                                                        <RestaurarParcelaBtn parcelaId={p.id} />
                                                    ) : (
                                                        <ParcelaActions parcela={{
                                                            id: p.id,
                                                            valor_previsto: p.valor_previsto,
                                                            status_manual_override: p.status_manual_override,
                                                            numero_referencia: p.numero_referencia,
                                                            sub_indice: p.sub_indice,
                                                            forma_pagamento_contrato: p.forma_pagamento_contrato ?? undefined,
                                                            observacao: p.observacao,
                                                            data_vencimento: p.data_vencimento,
                                                            hasPagamento: p.hasPagamento,
                                                            contrato_id: p.contratoId,
                                                            cliente_id: cliente.id,
                                                        }} />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── CRM TAB ──────────────────────────────────────────────── */}
                {activeTab === 'crm' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                        {/* LEFT: SYSTEM LOGS */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Activity size={16} className="text-orange-500" />
                                Logs do Sistema
                            </h3>
                            <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2">
                                {logs.length === 0 ? (
                                    <p className="text-xs text-gray-500 bg-white/5 p-4 rounded-xl">
                                        Nenhuma atividade registrada ainda.
                                    </p>
                                ) : (
                                    logs.map((log: any) => (
                                        <div key={log.id} className="flex gap-3 bg-white/[0.02] border border-white/5 p-3 rounded-xl hover:bg-white/5 transition-colors">
                                            <div className="mt-1.5 w-2 h-2 rounded-full bg-orange-500/50 shrink-0" />
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{log.usuario_email}</span>
                                                    <span className="text-[10px] text-gray-500">• {new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                </div>
                                                <span className="text-xs text-white mt-1">
                                                    <strong className="text-orange-400">{log.acao}</strong> em
                                                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] tracking-wider uppercase ml-1">{log.tabela_afetada}</span>
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* RIGHT: HUMAN COMMENTS */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <MessageSquare size={16} className="text-orange-500" />
                                Comentários da Equipe
                            </h3>
                            <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
                                {comentarios.length === 0 ? (
                                    <p className="text-xs text-gray-500 bg-white/5 p-4 rounded-xl">
                                        Nenhum comentário adicionado.
                                    </p>
                                ) : (
                                    comentarios.map((c) => {
                                        const nome = c.usuarios?.nome ?? 'Usuário';
                                        const avatarUrl = c.usuarios?.avatar_url;
                                        const isAdmin = c.usuarios?.cargo === 'ADMIN';
                                        const inicial = nome.charAt(0).toUpperCase();
                                        return (
                                            <div key={c.id} className="flex flex-col bg-white/[0.02] backdrop-blur-xl border border-white/10 p-4 rounded-xl rounded-tr-sm shadow-lg">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        {/* Avatar */}
                                                        <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center overflow-hidden shrink-0">
                                                            {avatarUrl ? (
                                                                <img src={avatarUrl} alt={nome} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[10px] font-black text-orange-400">{inicial}</span>
                                                            )}
                                                        </div>
                                                        {/* Name + badge */}
                                                        <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">{nome}</span>
                                                        {isAdmin && (
                                                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded bg-orange-500/15 border border-orange-500/30 text-orange-400">
                                                                ADMIN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-gray-500">{new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                </div>
                                                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{c.comentario}</p>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <CommentForm clienteId={id} />
                        </div>

                    </div>
                )}

            </div>
        </div>
    );
}
