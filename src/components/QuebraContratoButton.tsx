'use client';

import { useState, useTransition } from 'react';
import { Scale, AlertTriangle, X } from 'lucide-react';
import { quebrarContrato } from '@/actions/clientes';
import { brl } from '@/lib/utils';

interface ParcelaExtrato {
    id: string;
    numero_referencia: number;
    data_vencimento: string;
    valorBase: number;
    diasAtraso: number;
    mesesJuros: number;
    juros: number;
    totalAtualizado: number;
}

interface Props {
    clienteId: string;
    statusCliente: string | null;
    /** Pre-computed extrato from calcularExtratoQuebraContrato — passed from Server Component */
    extrato?: { parcelas: ParcelaExtrato[]; totalDivida: number } | null;
    /** If already QUEBRA_CONTRATO, show extrato panel instead of button */
    jaQuebraContrato?: boolean;
}

export default function QuebraContratoButton({ clienteId, statusCliente, extrato, jaQuebraContrato }: Props) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleConfirm() {
        setError(null);
        startTransition(async () => {
            const res = await quebrarContrato(clienteId);
            if (res.ok) {
                setOpen(false);
            } else {
                setError(res.error ?? 'Erro desconhecido.');
            }
        });
    }

    const canApply = statusCliente === 'INADIMPLENTE';

    // If already in quebra, render debt extrato panel
    if (jaQuebraContrato && extrato) {
        return (
            <div className="rounded-2xl bg-red-900/10 border border-red-700/30 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-red-700/20">
                    <div className="flex items-center gap-2">
                        <Scale size={16} className="text-red-400" />
                        <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
                            Extrato de Dívida — Quebra de Contrato
                        </span>
                    </div>
                    <span className="text-xs text-gray-500">juros calculados em tempo real</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-red-900/20">
                                <th className="text-left px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">#</th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Vencimento</th>
                                <th className="text-right px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Valor Original</th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Dias em Aberto</th>
                                <th className="text-center px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Meses Juros</th>
                                <th className="text-right px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Juros (1.5%/mês)</th>
                                <th className="text-right px-6 py-3 text-[10px] font-semibold text-red-500/70 uppercase tracking-widest">Total Atualizado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {extrato.parcelas.map((p) => (
                                <tr key={p.id} className="border-b border-red-900/10 last:border-0 hover:bg-red-500/5 transition-colors">
                                    <td className="px-6 py-3 text-xs font-mono text-gray-400">{p.numero_referencia}</td>
                                    <td className="px-6 py-3 text-xs text-center text-red-400 font-medium">
                                        {new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-6 py-3 text-xs text-right text-white font-semibold">{brl(p.valorBase)}</td>
                                    <td className="px-6 py-3 text-xs text-center text-orange-400">{p.diasAtraso}d</td>
                                    <td className="px-6 py-3 text-xs text-center text-gray-400">{p.mesesJuros}</td>
                                    <td className="px-6 py-3 text-xs text-right text-red-400 font-medium">{brl(p.juros)}</td>
                                    <td className="px-6 py-3 text-sm text-right text-red-300 font-black">{brl(p.totalAtualizado)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-red-700/30 bg-red-900/10">
                                <td colSpan={6} className="px-6 py-4 text-xs font-bold text-red-400 uppercase tracking-widest text-right">
                                    Total da Dívida Atualizada
                                </td>
                                <td className="px-6 py-4 text-lg font-black text-red-300 text-right">
                                    {brl(extrato.totalDivida)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    }

    if (!canApply) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-red-900/20 border border-red-700/40 hover:bg-red-900/30 hover:border-red-500/50 text-red-400 hover:text-red-300 px-4 py-2 text-xs font-bold transition-all"
            >
                <Scale size={13} />
                Quebra de Contrato
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md rounded-2xl bg-[#111] border border-red-700/40 shadow-2xl p-6 flex flex-col gap-5">
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-900/30 border border-red-700/40 flex items-center justify-center shrink-0">
                                <Scale size={18} className="text-red-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white">Quebra de Contrato</h2>
                                <p className="text-[11px] text-gray-500">Ação jurídica irreversível</p>
                            </div>
                        </div>

                        <div className="rounded-xl bg-red-900/15 border border-red-700/30 p-4 flex gap-3">
                            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-gray-300 leading-relaxed space-y-1">
                                <p>Esta ação irá:</p>
                                <ul className="list-disc list-inside space-y-1 text-gray-400 ml-1">
                                    <li>Mudar o status do cliente para <strong className="text-red-400">QUEBRA DE CONTRATO</strong></li>
                                    <li>Marcar todas as parcelas abertas como <strong className="text-red-400">QUEBRA DE CONTRATO</strong></li>
                                    <li>Remover o cliente das previsões de caixa</li>
                                    <li>Os juros continuam acumulando em tempo real (1.5%/mês)</li>
                                </ul>
                            </div>
                        </div>

                        {extrato && extrato.parcelas.length > 0 && (
                            <div className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                                    Dívida atual ({extrato.parcelas.length} parcela{extrato.parcelas.length !== 1 ? 's' : ''})
                                </p>
                                <p className="text-2xl font-black text-red-400">{brl(extrato.totalDivida)}</p>
                                <p className="text-[10px] text-gray-600 mt-1">inclui juros já acumulados</p>
                            </div>
                        )}

                        {error && (
                            <p className="text-xs text-red-400 bg-red-900/10 border border-red-700/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => setOpen(false)}
                                className="flex-1 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white py-2.5 text-xs font-medium transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isPending}
                                className="flex-1 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2"
                            >
                                {isPending ? 'Processando...' : 'Confirmar Quebra'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
