'use client';

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { Pencil, Eye, Trash2, X, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { softDeleteCliente, restaurarCliente } from "@/actions/clientes";
import { useRouter } from "next/navigation";
import EditarClienteModal, { type ClienteEditData } from "@/components/EditarClienteModal";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClienteActionsProps extends ClienteEditData {
    isAdmin: boolean;
    /** true when the client is soft-deleted (deleted_at IS NOT NULL) */
    isDeleted?: boolean;
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteModal({ clienteId, nomeCliente, onClose }: {
    clienteId: string; nomeCliente: string; onClose: () => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const res = await softDeleteCliente(clienteId);
            if (res.ok) router.push('/consultar-clientes');
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-md rounded-2xl bg-[#111] border border-white/10 shadow-2xl p-6 flex flex-col gap-5">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 text-red-400 shrink-0"><AlertTriangle size={16} /></span>
                    <div>
                        <h2 className="text-base font-bold text-white">Excluir Cliente</h2>
                        <p className="text-xs text-gray-500">Esta ação pode ser revertida pelo admin</p>
                    </div>
                </div>
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                    <p className="text-sm text-gray-300 leading-relaxed">Tem certeza que deseja excluir logicamente <strong className="text-white">{nomeCliente}</strong>? O registro será ocultado da lista, mas pode ser recuperado.</p>
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                <div className="flex gap-3 justify-end">
                    <button onClick={onClose} disabled={isPending} className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50">Cancelar</button>
                    <button onClick={handleConfirmar} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 text-white px-5 py-2 text-sm font-bold transition-all disabled:opacity-50">
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {isPending ? "Excluindo…" : "Confirmar Exclusão"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Restore button (admin only, soft-deleted clients) ────────────────────────
function RestaurarClienteBtn({ clienteId }: { clienteId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleRestaurar() {
        setError(null);
        startTransition(async () => {
            const res = await restaurarCliente(clienteId);
            if (res.ok) router.refresh();
            else setError(res.error ?? "Erro ao restaurar.");
        });
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                onClick={handleRestaurar}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-xl border border-green-500/30 hover:border-green-500 bg-green-500/5 hover:bg-green-500/10 text-green-400 px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
            >
                {isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                {isPending ? "Restaurando…" : "Restaurar Cliente"}
            </button>
            {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClienteActions({ isAdmin, isDeleted, ...clienteData }: ClienteActionsProps) {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <>
            <div className="flex items-center gap-2">
                {/* View/Edit button — always visible, icon adapts to role */}
                <button
                    onClick={() => setIsEditOpen(true)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${isAdmin
                            ? "border-orange-500/30 hover:border-orange-500 bg-orange-500/5 hover:bg-orange-500/10 text-orange-400"
                            : "border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-gray-300"
                        }`}
                >
                    {isAdmin ? <Pencil size={13} /> : <Eye size={13} />}
                    {isAdmin ? "Editar Cliente" : "Ver Ficha Completa"}
                </button>

                {/* Admin + NOT deleted → Excluir */}
                {isAdmin && !isDeleted && (
                    <button onClick={() => setIsDeleteOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-red-500/30 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-red-400 px-3 py-2 text-xs font-semibold transition-all">
                        <Trash2 size={13} /> Excluir Cliente
                    </button>
                )}

                {/* Admin + IS deleted → Restaurar */}
                {isAdmin && isDeleted && mounted && (
                    <RestaurarClienteBtn clienteId={clienteData.clienteId} />
                )}
            </div>

            {/* Edit / View modal */}
            <EditarClienteModal
                isOpen={mounted && isEditOpen}
                onClose={() => setIsEditOpen(false)}
                clienteData={clienteData}
                isAdmin={isAdmin}
            />

            {/* Delete confirmation modal (admin only) */}
            {mounted && isDeleteOpen && (
                <DeleteModal
                    clienteId={clienteData.clienteId}
                    nomeCliente={clienteData.nome_cliente}
                    onClose={() => setIsDeleteOpen(false)}
                />
            )}
        </>
    );
}
