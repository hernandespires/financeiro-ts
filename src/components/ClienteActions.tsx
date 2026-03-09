'use client';

import { useState, useTransition, useEffect } from "react";
import { Pencil, Eye, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { softDeleteCliente, restaurarCliente } from "@/actions/clientes";
import { useRouter } from "next/navigation";
import EditarClienteModal, { type ClienteEditData } from "@/components/EditarClienteModal";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

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

    return (
        <Modal
            onClose={onClose}
            title="Excluir Cliente"
            subtitle="Esta ação pode ser revertida pelo admin"
            icon={<AlertTriangle size={16} className="text-red-400" />}
        >
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    Tem certeza que deseja excluir logicamente{" "}
                    <strong className="text-white">{nomeCliente}</strong>? O registro será ocultado
                    da lista, mas pode ser recuperado.
                </p>
            </div>
            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="danger" onClick={handleConfirmar} isLoading={isPending} icon={<Trash2 size={14} />}>
                    {isPending ? "Excluindo…" : "Confirmar Exclusão"}
                </Button>
            </div>
        </Modal>
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
            <Button
                variant="success"
                onClick={handleRestaurar}
                isLoading={isPending}
                icon={<RotateCcw size={13} />}
                className="text-xs px-3 py-2"
            >
                {isPending ? "Restaurando…" : "Restaurar Cliente"}
            </Button>
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
                    <button
                        onClick={() => setIsDeleteOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-red-500/30 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-red-400 px-3 py-2 text-xs font-semibold transition-all"
                    >
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
