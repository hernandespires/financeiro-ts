"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, GitBranch, Loader2, X, CreditCard, Scissors } from "lucide-react";
import { registrarPagamentoCompleto, desmembrarParcela } from "@/actions/parcelas";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ParcelaForActions {
    id: string;
    valor_previsto: number;
    status_manual_override: string;
    numero_referencia?: number;
    sub_indice?: number | null;
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
    "w-full rounded-xl bg-black/60 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors";

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
    const [plataforma, setPlataforma] = useState("PIX");
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
            const res = await registrarPagamentoCompleto(parcela.id, val, dataPagamento, plataforma);
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
                        <option value="STRIPE BRASIL">STRIPE BRASIL</option>
                        <option value="STRIPE EUA">STRIPE EUA</option>
                        <option value="IUGU">IUGU</option>
                        <option value="LOJA">LOJA</option>
                        <option value="PIX">PIX</option>
                        <option value="APP DE TRANSFERÊNCIA">APP DE TRANSFERÊNCIA</option>
                        <option value="DINHEIRO">DINHEIRO</option>
                    </select>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ParcelaActions({ parcela }: ParcelaActionsProps) {
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isSplitOpen, setIsSplitOpen] = useState(false);
    const [localPago, setLocalPago] = useState(parcela.status_manual_override === "PAGO");
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const isPago = localPago;
    const isNormal = parcela.status_manual_override === "NORMAL";

    // Already paid
    if (isPago) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400/70">
                <Check size={11} strokeWidth={2.5} />
                Recebido
            </span>
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
            <div className="inline-flex items-center gap-1.5">
                {/* Dar Baixa */}
                <button
                    onClick={() => setIsPaymentOpen(true)}
                    title="Registrar pagamento"
                    className="inline-flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-green-400 px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                >
                    <Check size={11} strokeWidth={2.5} />
                    Dar Baixa
                </button>

                {/* Dividir */}
                <button
                    onClick={() => setIsSplitOpen(true)}
                    title="Desmembrar parcela"
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40 text-orange-400 px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                >
                    <GitBranch size={11} strokeWidth={2} />
                    Dividir
                </button>
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
        </>
    );
}
