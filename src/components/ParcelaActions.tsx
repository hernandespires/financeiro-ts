"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, GitBranch, Loader2, X, CreditCard, Scissors, Pencil, Trash2, AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { registrarPagamentoCompleto, desmembrarParcela, editarParcela, softDeleteParcela } from "@/actions/parcelas";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ParcelaForActions {
    id: string;
    valor_previsto: number;
    status_manual_override: string;
    numero_referencia?: number;
    sub_indice?: number | null;
    forma_pagamento_contrato?: string;
    observacao?: string | null;
    data_vencimento?: string;
    hasPagamento?: boolean; // true = already paid in pagamentos table, hides edit/delete
}

interface ParcelaActionsProps {
    parcela: ParcelaForActions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Shared Modal Shell ───────────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-md rounded-2xl bg-[#111] border border-white/10 shadow-2xl shadow-black/60 p-6 flex flex-col gap-6">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X size={18} />
                </button>
                {children}
            </div>
        </div>,
        document.body
    );
}

// ─── Shared Input styles ──────────────────────────────────────────────────────
const inputCls =
    "w-full rounded-xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors";

const labelCls = "text-[11px] font-semibold text-gray-400 uppercase tracking-widest";

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({
    parcela,
    onClose,
    onSuccess,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [valorPago, setValorPago] = useState(parcela.valor_previsto.toFixed(2));
    const [dataPagamento, setDataPagamento] = useState(todayISO());
    const [plataforma, setPlataforma] = useState(parcela.forma_pagamento_contrato || "PIX");
    const [observacao, setObservacao] = useState(parcela.observacao || "");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSalvar() {
        setError(null);
        const val = parseFloat(valorPago);
        if (isNaN(val) || val <= 0) {
            setError("Informe um valor válido.");
            return;
        }
        startTransition(async () => {
            const res = await registrarPagamentoCompleto(parcela.id, val, dataPagamento, plataforma, observacao || undefined);
            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                setError(res.error ?? "Erro desconhecido.");
            }
        });
    }

    return (
        <Modal onClose={onClose}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-green-500/10 text-green-400 shrink-0">
                    <CreditCard size={18} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Registrar Pagamento</h2>
                    <p className="text-xs text-gray-500">
                        Valor previsto: {brl(parcela.valor_previsto)}
                    </p>
                </div>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Valor Pago (R$)</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={valorPago}
                        onChange={(e) => setValorPago(e.target.value)}
                        className={inputCls}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Data do Pagamento</label>
                    <input
                        type="date"
                        value={dataPagamento}
                        onChange={(e) => setDataPagamento(e.target.value)}
                        className={inputCls}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Plataforma</label>
                    <select
                        value={plataforma}
                        onChange={(e) => setPlataforma(e.target.value)}
                        className={inputCls + " cursor-pointer"}
                    >
                        <option value="STRIPE BRASIL" className="bg-[#111] text-white">STRIPE BRASIL</option>
                        <option value="STRIPE EUA" className="bg-[#111] text-white">STRIPE EUA</option>
                        <option value="IUGU" className="bg-[#111] text-white">IUGU</option>
                        <option value="LOJA" className="bg-[#111] text-white">LOJA</option>
                        <option value="PIX" className="bg-[#111] text-white">PIX</option>
                        <option value="APP DE TRANSFERÊNCIA" className="bg-[#111] text-white">APP DE TRANSFERÊNCIA</option>
                        <option value="DINHEIRO" className="bg-[#111] text-white">DINHEIRO</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Observações (Opcional)</label>
                    <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Atrasou por problema no cartão..."
                        className={inputCls + " resize-none h-20"}
                    />
                </div>

                {error && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
                <button
                    onClick={onClose}
                    disabled={isPending}
                    className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleSalvar}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-black px-5 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                    {isPending ? "Salvando…" : "Confirmar"}
                </button>
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
        if (!saldoValido) {
            setError("O novo valor deve ser maior que zero e menor que o valor original.");
            return;
        }
        startTransition(async () => {
            const res = await desmembrarParcela(parcela.id, novoValorNum);
            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                setError(res.error ?? "Erro desconhecido.");
            }
        });
    }

    return (
        <Modal onClose={onClose}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 shrink-0">
                    <Scissors size={18} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Desmembrar Parcela</h2>
                    <p className="text-xs text-gray-500">
                        Valor original: {brl(parcela.valor_previsto)}
                    </p>
                </div>
            </div>

            {/* Field */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo valor desta parcela (R$)</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={parcela.valor_previsto - 0.01}
                        value={novoValor}
                        onChange={(e) => setNovoValor(e.target.value)}
                        placeholder={`Máx. ${brl(parcela.valor_previsto - 0.01)}`}
                        className={inputCls}
                        autoFocus
                    />
                </div>

                {/* Live preview */}
                <div
                    className={`rounded-xl border p-3 text-xs leading-relaxed transition-all ${saldoValido
                        ? "bg-orange-500/5 border-orange-500/20 text-orange-300"
                        : "bg-white/3 border-white/5 text-gray-600"
                        }`}
                >
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

                {error && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
                <button
                    onClick={onClose}
                    disabled={isPending}
                    className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleDividir}
                    disabled={isPending || !saldoValido}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-black px-5 py-2 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} strokeWidth={2} />}
                    {isPending ? "Dividindo…" : "Dividir"}
                </button>
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
            if (res.ok) {
                onClose();
            } else {
                setError(res.error ?? "Erro desconhecido.");
            }
        });
    }

    return (
        <Modal onClose={onClose}>
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                    <Pencil size={16} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Editar Parcela</h2>
                    <p className="text-xs text-gray-500">Reajuste valor ou data de vencimento</p>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo Valor (R$)</label>
                    <input type="number" min="0.01" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Nova Data de Vencimento</label>
                    <input type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} className={inputCls} />
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="flex gap-3 justify-end">
                <button onClick={onClose} disabled={isPending} className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50">Cancelar</button>
                <button onClick={handleSalvar} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                    {isPending ? "Salvando…" : "Salvar"}
                </button>
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

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const res = await softDeleteParcela(parcela.id);
            if (res.ok) {
                onClose();
            } else {
                setError(res.error ?? "Erro desconhecido.");
            }
        });
    }

    const ref = parcela.sub_indice
        ? `${parcela.numero_referencia}-${parcela.sub_indice}`
        : `${parcela.numero_referencia}`;

    return (
        <Modal onClose={onClose}>
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 text-red-400 shrink-0">
                    <AlertTriangle size={16} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Excluir Parcela #{ref}</h2>
                    <p className="text-xs text-gray-500">Esta ação pode ser revertida pelo admin</p>
                </div>
            </div>

            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    A parcela de <strong className="text-white">{brl(parcela.valor_previsto)}</strong> será marcada como excluída logicamente e removida da listagem.
                </p>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 justify-end">
                <button onClick={onClose} disabled={isPending} className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50">Cancelar</button>
                <button onClick={handleConfirmar} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 text-white px-5 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {isPending ? "Excluindo…" : "Confirmar"}
                </button>
            </div>
        </Modal>
    );
}

// ─── Não Renovar Modal ─────────────────────────────────────────────────────────────
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
            // Import inline to avoid circular dep issues
            const { editarParcelaStatus } = await import("@/actions/parcelas");
            const res = await editarParcelaStatus(parcela.id, "FINALIZAR PROJETO");
            if (res.ok) {
                setDone(true);
            } else {
                setError(res.error ?? "Erro desconhecido.");
            }
        });
    }

    return (
        <Modal onClose={onClose}>
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 text-red-400 shrink-0">
                    <XCircle size={18} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Não Renovar Contrato</h2>
                    <p className="text-xs text-gray-500">Esta ação é permanente e registra o churn.</p>
                </div>
            </div>

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

                    {error && (
                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            disabled={isPending}
                            className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmar}
                            disabled={isPending}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 text-white px-5 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            {isPending ? "Finalizando…" : "Confirmar Churn"}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Renovar Modal ──────────────────────────────────────────────────────────────────
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

    function handleRenovar() {
        startTransition(async () => {
            // Backend generation wired in next step
            console.log("[RenovarModal] Dados para renovação:", {
                parcelaId: parcela.id,
                novo_periodo_meses: Number(periodo),
                novo_valor_total: parseFloat(valorTotal),
            });
            onClose();
        });
    }

    return (
        <Modal onClose={onClose}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-green-500/10 text-green-400 shrink-0">
                    <RefreshCw size={18} />
                </span>
                <div>
                    <h2 className="text-base font-bold text-white">Renovar Contrato</h2>
                    <p className="text-xs text-gray-500">Defina o período e valor da renovação</p>
                </div>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo Período (meses)</label>
                    <input
                        type="number"
                        min="1"
                        max="60"
                        step="1"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        className={inputCls}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo Valor Total (R$)</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={valorTotal}
                        onChange={(e) => setValorTotal(e.target.value)}
                        placeholder="Ex: 12000.00"
                        className={inputCls}
                    />
                </div>

                <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3 text-xs text-green-300 leading-relaxed">
                    📅 Serão geradas <strong className="text-white">{periodo} novas parcelas</strong> com valor
                    de <strong className="text-white">
                        {valorTotal ? brl(parseFloat(valorTotal) / Number(periodo)) : "R$ —"}
                    </strong> cada.
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
                <button
                    onClick={onClose}
                    disabled={isPending}
                    className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleRenovar}
                    disabled={isPending || !valorTotal || Number(periodo) < 1}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-500 hover:bg-green-400 active:bg-green-600 text-black px-5 py-2 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isPending ? "Processando…" : "Renovar"}
                </button>
            </div>
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

    // Not actionable (e.g., RENOVAR CONTRATO, etc.)
    if (!isNormal) {
        return (
            <span className="text-[11px] text-gray-600 font-medium">
                {parcela.status_manual_override}
            </span>
        );
    }

    return (
        <>
            {/* Action buttons */}
            <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                {/* Dar Baixa */}
                <button
                    onClick={() => setIsPaymentOpen(true)}
                    title="Registrar pagamento"
                    className="inline-flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-green-400 px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                >
                    <Check size={11} strokeWidth={2.5} />
                    Dar Baixa
                </button>

                {/* Dividir — hidden for sub-installments (4-1, 4-2, …) */}
                {showSplit && (
                    <button
                        onClick={() => setIsSplitOpen(true)}
                        title="Desmembrar parcela"
                        className="inline-flex items-center gap-1 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40 text-orange-400 px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                    >
                        <GitBranch size={11} strokeWidth={2} />
                        Dividir
                    </button>
                )}

                {/* Edit — only for unpaid (no pagamento record) */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsEditOpen(true)}
                        title="Editar parcela"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 text-blue-400 transition-all"
                    >
                        <Pencil size={11} />
                    </button>
                )}

                {/* Delete — only for unpaid */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsDeleteOpen(true)}
                        title="Excluir parcela"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-400 transition-all"
                    >
                        <Trash2 size={11} />
                    </button>
                )}
            </div>

            {/* Modals — portaled to document.body to escape table/backdrop-blur clipping */}
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
