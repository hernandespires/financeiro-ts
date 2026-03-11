"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, GitBranch, CreditCard, Scissors, Pencil, Trash2, AlertTriangle, RefreshCw, XCircle, Split } from "lucide-react";
import { registrarPagamentoCompleto, desmembrarParcela, editarParcela, softDeleteParcela } from "@/actions/parcelas";
import { renovarContrato } from "@/actions/renovacao";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ParcelaForActions {
    id: string;
    valor_previsto: number;
    valor_bruto?: number | null;
    imposto_percentual?: number | null;
    status_manual_override: string;
    numero_referencia?: number;
    sub_indice?: number | null;
    forma_pagamento_contrato?: string;
    observacao?: string | null;
    data_vencimento?: string;
    hasPagamento?: boolean;
    contrato_id?: string | null;
    cliente_id?: string | null;
}

interface ParcelaActionsProps {
    parcela: ParcelaForActions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Shared Input styles ──────────────────────────────────────────────────────
const inputCls =
    "w-full rounded-xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors";

const labelCls = "text-[11px] font-semibold text-gray-400 uppercase tracking-widest";

// ─── Error message helper ─────────────────────────────────────────────────────
function ErrorMsg({ msg }: { msg: string | null }) {
    if (!msg) return null;
    return (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {msg}
        </p>
    );
}

// ─── Payment Modal — Reverse Math Calculator ─────────────────────────────────
function PaymentModal({
    parcela,
    onClose,
    onSuccess,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const brutoOriginal = parcela.valor_bruto ?? parcela.valor_previsto ?? 0;
    const impostoPerc = parcela.imposto_percentual ?? 0;

    const [valorPlataforma, setValorPlataforma] = useState(brutoOriginal.toFixed(2));
    const [dataPagamento, setDataPagamento] = useState(todayISO());
    const [plataforma, setPlataforma] = useState(parcela.forma_pagamento_contrato || 'PIX');
    const [observacao, setObservacao] = useState(parcela.observacao || '');
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // ── Reverse-Math (derived, no state) ──────────────────────────────────────
    const numPlataforma = parseFloat(valorPlataforma) || 0;               // arrived on platform
    const taxaCalculada = Math.max(0, brutoOriginal - numPlataforma);      // what the platform took
    const impostoCalculado = numPlataforma * (impostoPerc / 100);          // withheld tax
    const liquidoFinal = Math.max(0, numPlataforma - impostoCalculado);    // real net

    function handleSalvar() {
        setError(null);
        if (numPlataforma <= 0) { setError('Informe o valor que chegou na plataforma.'); return; }
        startTransition(async () => {
            const res = await registrarPagamentoCompleto(
                parcela.id,
                liquidoFinal,
                taxaCalculada,
                impostoCalculado,
                0,              // jurosAplicado — handled automatically in future
                dataPagamento,
                plataforma,
                observacao || undefined
            );
            if (res.ok) { onSuccess(); onClose(); }
            else setError(res.error ?? 'Erro desconhecido.');
        });
    }

    const fmtNum = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const SummaryRow = ({ label, value, variant = 'normal', bold = false }: {
        label: string; value: string; variant?: 'normal' | 'deduct' | 'total' | 'muted'; bold?: boolean;
    }) => {
        const colors = {
            normal: 'text-gray-300',
            deduct: 'text-red-400',
            total: 'text-green-400',
            muted: 'text-gray-500',
        };
        return (
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                <span className={`text-[11px] ${bold ? 'font-bold' : ''} text-gray-500`}>{label}</span>
                <span className={`text-[11px] font-mono ${bold ? 'font-bold' : ''} ${colors[variant]}`}>{value}</span>
            </div>
        );
    };

    return (
        <Modal
            onClose={onClose}
            title="Registrar Pagamento"
            subtitle={`Valor previsto (líquido): ${brl(parcela.valor_previsto)}`}
            icon={<CreditCard size={18} className="text-green-400" />}
        >
            <div className="flex flex-col gap-4">

                {/* Inputs Row 1: Platform + Date */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Plataforma</label>
                        <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}
                            className={inputCls + " cursor-pointer"}>
                            {["STRIPE BRASIL", "STRIPE EUA", "IUGU", "LOJA", "PIX", "APP DE TRANSFERÊNCIA", "DINHEIRO"].map(p => (
                                <option key={p} value={p} className="bg-[#111] text-white">{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Data do Pagamento</label>
                        <input type="date" value={dataPagamento}
                            onChange={(e) => setDataPagamento(e.target.value)} className={inputCls} />
                    </div>
                </div>

                {/* Main input: what landed on platform */}
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>
                        Valor Recebido na Plataforma (R$)
                        <span className="ml-2 text-orange-400 normal-case font-normal">← digite aqui</span>
                    </label>
                    <input type="number" min="0.01" step="0.01" value={valorPlataforma}
                        onChange={(e) => setValorPlataforma(e.target.value)}
                        placeholder={brutoOriginal.toFixed(2)}
                        className={`${inputCls} text-orange-300 font-bold text-base`}
                        autoFocus />
                    <p className="text-[10px] text-gray-600">Bruto esperado: {fmtNum(brutoOriginal)}{impostoPerc > 0 ? ` · Imposto: ${impostoPerc}%` : ''}</p>
                </div>

                {/* ── Resumo da Transação ── */}
                <div className="rounded-xl bg-white/[0.02] border border-white/10 px-4 py-3 flex flex-col">
                    <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mb-2">Resumo da Transação</p>
                    <SummaryRow label="(=) Bruto Esperado" value={fmtNum(brutoOriginal)} bold />
                    <SummaryRow label="(−) Taxa Plataforma (calculada)" value={fmtNum(taxaCalculada)} variant="deduct" />
                    {impostoPerc > 0 && <SummaryRow label={`(−) Imposto Retido (${impostoPerc}%)`} value={fmtNum(impostoCalculado)} variant="deduct" />}
                    <SummaryRow label="(=) Líquido Real" value={fmtNum(liquidoFinal)} variant="total" bold />
                </div>

                {/* Observação */}
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Observações (Opcional)</label>
                    <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Atrasou por problema no cartão..."
                        className={inputCls + " resize-none h-16"} />
                </div>

                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="success" onClick={handleSalvar} isLoading={isPending} icon={<Check size={14} strokeWidth={2.5} />}>
                    {isPending ? 'Salvando…' : `Confirmar — ${fmtNum(liquidoFinal)}`}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Split Modal ──────────────────────────────────────────────────────────────
function SplitModal({
    parcela,
    onClose,
    onSuccess,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [novoValor, setNovoValor] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const novoValorNum = parseFloat(novoValor) || 0;
    const saldo = parseFloat((parcela.valor_previsto - novoValorNum).toFixed(2));
    const saldoValido = saldo > 0 && novoValorNum > 0 && novoValorNum < parcela.valor_previsto;

    function handleDividir() {
        setError(null);
        if (!saldoValido) { setError("O novo valor deve ser maior que zero e menor que o valor original."); return; }
        startTransition(async () => {
            const res = await desmembrarParcela(parcela.id, novoValorNum);
            if (res.ok) { onSuccess(); onClose(); }
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Desmembrar Parcela"
            subtitle={`Valor original: ${brl(parcela.valor_previsto)}`}
            icon={<Scissors size={18} className="text-orange-400" />}
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo valor desta parcela (R$)</label>
                    <input type="number" min="0.01" step="0.01" max={parcela.valor_previsto - 0.01}
                        value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
                        placeholder={`Máx. ${brl(parcela.valor_previsto - 0.01)}`}
                        className={inputCls} autoFocus />
                </div>

                {/* Live preview */}
                <div className={`rounded-xl border p-3 text-xs leading-relaxed transition-all ${saldoValido
                    ? "bg-orange-500/5 border-orange-500/20 text-orange-300"
                    : "bg-white/3 border-white/5 text-gray-600"}`}>
                    {saldoValido ? (
                        <>
                            ✂️ Esta parcela ficará com <strong className="text-white">{brl(novoValorNum)}</strong>
                            <br />
                            Uma nova parcela será criada com o saldo restante de{" "}
                            <strong className="text-orange-400">{brl(saldo)}</strong>
                        </>
                    ) : (
                        "Informe um valor para visualizar o desmembramento."
                    )}
                </div>

                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="primary" onClick={handleDividir} isLoading={isPending}
                    disabled={isPending || !saldoValido}
                    icon={<GitBranch size={14} strokeWidth={2} />}>
                    {isPending ? "Dividindo…" : "Dividir"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Edit Parcela Modal ───────────────────────────────────────────────────────
function EditParcelaModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [valor, setValor] = useState(parcela.valor_previsto.toFixed(2));
    const [dataVenc, setDataVenc] = useState(parcela.data_vencimento ?? todayISO());
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSalvar() {
        setError(null);
        const val = parseFloat(valor);
        if (isNaN(val) || val <= 0) { setError("Informe um valor válido."); return; }
        if (!dataVenc) { setError("Informe a data de vencimento."); return; }
        startTransition(async () => {
            const res = await editarParcela(parcela.id, val, dataVenc);
            if (res.ok) onClose();
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Editar Parcela"
            subtitle="Reajuste valor ou data de vencimento"
            icon={<Pencil size={16} className="text-blue-400" />}
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo Valor (R$)</label>
                    <input type="number" min="0.01" step="0.01" value={valor}
                        onChange={(e) => setValor(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Nova Data de Vencimento</label>
                    <input type="date" value={dataVenc}
                        onChange={(e) => setDataVenc(e.target.value)} className={inputCls} />
                </div>
                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="info" onClick={handleSalvar} isLoading={isPending} icon={<Check size={14} strokeWidth={2.5} />}>
                    {isPending ? "Salvando…" : "Salvar"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Delete Parcela Modal ─────────────────────────────────────────────────────
function DeleteParcelaModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const ref = parcela.sub_indice
        ? `${parcela.numero_referencia}-${parcela.sub_indice}`
        : `${parcela.numero_referencia}`;

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const res = await softDeleteParcela(parcela.id);
            if (res.ok) onClose();
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title={`Excluir Parcela #${ref}`}
            subtitle="Esta ação pode ser revertida pelo admin"
            icon={<AlertTriangle size={16} className="text-red-400" />}
        >
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    A parcela de <strong className="text-white">{brl(parcela.valor_previsto)}</strong> será
                    marcada como excluída logicamente e removida da listagem.
                </p>
            </div>

            <ErrorMsg msg={error} />

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="danger" onClick={handleConfirmar} isLoading={isPending} icon={<Trash2 size={14} />}>
                    {isPending ? "Excluindo…" : "Confirmar"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Não Renovar Modal ────────────────────────────────────────────────────────
function NaoRenovarModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const { editarParcelaStatus } = await import("@/actions/parcelas");
            const res = await editarParcelaStatus(parcela.id, "FINALIZAR PROJETO");
            if (res.ok) setDone(true);
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Não Renovar Contrato"
            subtitle="Esta ação é permanente e registra o churn."
            icon={<XCircle size={18} className="text-red-400" />}
        >
            {done ? (
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 text-center">
                    <p className="text-sm text-red-300 font-semibold">✔ Contrato finalizado. Sem renovação.</p>
                </div>
            ) : (
                <>
                    <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                        <p className="text-sm text-gray-300 leading-relaxed">
                            O status desta parcela será alterado para{" "}
                            <strong className="text-red-400">FINALIZAR PROJETO</strong>, sinalizando o churn
                            definitivo deste cliente. Esta ação pode ser revertida pelo admin.
                        </p>
                    </div>
                    <ErrorMsg msg={error} />
                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                        <Button variant="danger" onClick={handleConfirmar} isLoading={isPending} icon={<XCircle size={14} />}>
                            {isPending ? "Finalizando…" : "Confirmar Churn"}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Renovar Modal ────────────────────────────────────────────────────────────
function RenovarModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [periodo, setPeriodo] = useState("12");
    const [valorTotal, setValorTotal] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const valorNum = parseFloat(valorTotal) || 0;
    const periodoNum = Number(periodo);
    const isValid = valorNum > 0 && periodoNum >= 1;

    function handleRenovar() {
        setError(null);
        if (!parcela.contrato_id || !parcela.cliente_id) {
            setError("Dados do contrato insuficientes. Recarregue a página.");
            return;
        }
        startTransition(async () => {
            const res = await renovarContrato({
                parcelaRenovacaoId: parcela.id,
                contratoAntigoId: parcela.contrato_id!,
                clienteId: parcela.cliente_id!,
                novo_periodo_meses: periodoNum,
                novo_valor_total: valorNum,
            });
            if (res.ok) setDone(true);
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Renovar Contrato"
            subtitle="Defina o período e valor da renovação"
            icon={<RefreshCw size={18} className="text-green-400" />}
        >
            {done ? (
                <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4 text-center">
                    <p className="text-sm text-green-300 font-semibold">✔ Contrato renovado com sucesso! As novas parcelas foram geradas.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Novo Período (meses)</label>
                            <input type="number" min="1" max="60" step="1" value={periodo}
                                onChange={(e) => setPeriodo(e.target.value)} className={inputCls} />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Novo Valor Total (R$)</label>
                            <input type="number" min="0.01" step="0.01" value={valorTotal}
                                onChange={(e) => setValorTotal(e.target.value)}
                                placeholder="Ex: 12000.00" className={inputCls} />
                        </div>

                        <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3 text-xs text-green-300 leading-relaxed">
                            📅 Serão geradas <strong className="text-white">{periodo} novas parcelas</strong> com valor
                            de <strong className="text-white">
                                {valorNum > 0 && periodoNum > 0 ? brl(valorNum / periodoNum) : "R$ —"}
                            </strong> cada.
                        </div>

                        {error && <ErrorMsg msg={error} />}
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                        <Button variant="success" onClick={handleRenovar} isLoading={isPending}
                            disabled={isPending || !isValid}
                            icon={<RefreshCw size={14} />}>
                            {isPending ? "Processando…" : "Renovar"}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ParcelaActions({ parcela }: ParcelaActionsProps) {
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isSplitOpen, setIsSplitOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isRenewOpen, setIsRenewOpen] = useState(false);
    const [isNotRenewOpen, setIsNotRenewOpen] = useState(false);
    const [localPago, setLocalPago] = useState(parcela.status_manual_override === "PAGO");
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const isPago = localPago;
    const isNormal = parcela.status_manual_override === "NORMAL";
    const showEditDelete = isNormal && !parcela.hasPagamento;
    // Only root installments (sub_indice === null or 0) can be split
    const showSplit = isNormal && (parcela.sub_indice === null || parcela.sub_indice === undefined || parcela.sub_indice === 0);

    // Already paid
    if (isPago) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400/70">
                <Check size={11} strokeWidth={2.5} />
                Recebido
            </span>
        );
    }

    // RENOVAR CONTRATO — date-gated renewal / churn buttons
    if (parcela.status_manual_override === "RENOVAR CONTRATO") {
        const todayStr = new Date().toISOString().split("T")[0];
        const isLiberado = todayStr >= (parcela.data_vencimento || "2099-01-01");

        return (
            <>
                <div className="inline-flex gap-2 items-center justify-center">
                    <button
                        onClick={() => setIsRenewOpen(true)}
                        disabled={!isLiberado}
                        title={!isLiberado ? "Aguarde a data de término do contrato" : "Processar renovação"}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Renovar
                    </button>
                    <button
                        onClick={() => setIsNotRenewOpen(true)}
                        disabled={!isLiberado}
                        title={!isLiberado ? "Aguarde a data de término do contrato" : "Registrar cancelamento/fim"}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Não Renovar
                    </button>
                </div>
                {mounted && isRenewOpen && (
                    <RenovarModal parcela={parcela} onClose={() => setIsRenewOpen(false)} />
                )}
                {mounted && isNotRenewOpen && (
                    <NaoRenovarModal parcela={parcela} onClose={() => setIsNotRenewOpen(false)} />
                )}
            </>
        );
    }

    // Not actionable statuses
    if (!isNormal) {
        return (
            <span className="text-[11px] text-gray-600 font-medium">
                {parcela.status_manual_override}
            </span>
        );
    }

    return (
        <>
            {/* Action buttons — strictly side-by-side minimalist style */}
            <div className="flex flex-row items-center justify-end gap-2">
                {/* Dar Baixa */}
                <button
                    onClick={() => setIsPaymentOpen(true)}
                    title="Registrar pagamento"
                    className="inline-flex items-center justify-center h-7 px-3 gap-1 rounded-full bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-green-400 text-[10px] font-semibold transition-all whitespace-nowrap"
                >
                    <Check size={11} strokeWidth={2.5} />
                    Dar Baixa
                </button>

                {/* Dividir — hidden for sub-installments */}
                {/* Dividir — hidden for sub-installments */}
                {showSplit && (
                    <button
                        onClick={() => setIsSplitOpen(true)}
                        title="Desmembrar parcela"
                        className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 text-blue-400 transition-all"
                    >
                        <Split size={11} strokeWidth={2.5} />
                    </button>
                )}

                {/* Edit — only for unpaid (no pagamento record) */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsEditOpen(true)}
                        title="Editar parcela"
                        className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-gray-300 transition-all"
                    >
                        <Pencil size={11} strokeWidth={2.5} />
                    </button>
                )}

                {/* Delete — only for unpaid */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsDeleteOpen(true)}
                        title="Excluir parcela"
                        className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-400 transition-all"
                    >
                        <Trash2 size={11} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {/* Modals — portaled to document.body via Modal component */}
            {mounted && isPaymentOpen && (
                <PaymentModal
                    parcela={parcela}
                    onClose={() => setIsPaymentOpen(false)}
                    onSuccess={() => setLocalPago(true)}
                />
            )}
            {mounted && isSplitOpen && (
                <SplitModal
                    parcela={parcela}
                    onClose={() => setIsSplitOpen(false)}
                    onSuccess={() => setIsSplitOpen(false)}
                />
            )}
            {mounted && isEditOpen && (
                <EditParcelaModal
                    parcela={parcela}
                    onClose={() => setIsEditOpen(false)}
                />
            )}
            {mounted && isDeleteOpen && (
                <DeleteParcelaModal
                    parcela={parcela}
                    onClose={() => setIsDeleteOpen(false)}
                />
            )}
        </>
    );
}
