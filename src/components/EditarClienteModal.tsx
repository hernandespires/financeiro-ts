'use client';

import { useState, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, Pencil } from 'lucide-react';
import { editarCliente } from '@/actions/clientes';

import { maskCurrency, unmaskCurrency } from '@/lib/masks';
import {
    validateCnpjEin, validatePhone, validateAniversario,
    validateSegmento, validateLinkAsana, validateListItem,
} from '@/lib/validators';
import { AGENCIAS, SDR_CLOSER } from '@/lib/constants';
import { inp, inpErr } from '@/components/ui/FormFields';
import type { SharedClientFormState, SharedClientFormErrors, FieldSetter } from '@/lib/formTypes';

import ClientDataFields from '@/components/forms/ClientDataFields';
import LocationFields from '@/components/forms/LocationFields';
import OperationFields from '@/components/forms/OperationFields';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ClienteEditData {
    clienteId: string;
    nome_cliente: string;
    empresa_label: string | null;
    cnpj_contrato: string | null;
    telefone: string | null;
    aniversario: string | null;
    pais: string | null;
    estado: string | null;
    cidade: string | null;
    segmento: string | null;
    link_asana: string | null;
    contratoId: string | null;
    valorTotalContrato: number | null;
    agencia: string | null;
    sdr: string | null;
    closer: string | null;
    cnpjVinculado: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    clienteData: ClienteEditData;
    isAdmin: boolean;
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-2xl rounded-2xl bg-[#0c0c0c] border border-white/10 shadow-2xl shadow-black/70 flex flex-col max-h-[90vh]">
                {/* Sticky header */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5 shrink-0">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 shrink-0"><Pencil size={16} /></span>
                    <div>
                        <h2 className="text-base font-bold text-white">Editar Cliente</h2>
                        <p className="text-xs text-gray-500">Dados cadastrais, localização e operação</p>
                    </div>
                    <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
                </div>
                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-6">{children}</div>
            </div>
        </div>,
        document.body
    );
}

// ─── Section divider label ────────────────────────────────────────────────────
const SectionTitle = ({ children }: { children: string }) => (
    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2 mt-2">{children}</p>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditarClienteModal({ isOpen, onClose, clienteData, isAdmin }: Props) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted || !isOpen) return null;
    return <EditForm onClose={onClose} clienteData={clienteData} isAdmin={isAdmin} />;
}

// ─── EditForm ─────────────────────────────────────────────────────────────────

function EditForm({ onClose, clienteData, isAdmin }: Omit<Props, 'isOpen'>) {
    // Map ClienteEditData → SharedClientFormState
    const [form, setFormRaw] = useState<SharedClientFormState>({
        nome: clienteData.nome_cliente,
        empresa: clienteData.empresa_label ?? '',
        cnpj: clienteData.cnpj_contrato ?? '',
        telefone: clienteData.telefone ?? '',
        aniversario: clienteData.aniversario ?? '',
        pais: clienteData.pais ?? 'Estados Unidos',
        estado: clienteData.estado ?? '',
        cidade: clienteData.cidade ?? '',
        segmento: clienteData.segmento ?? '',
        link_asana: clienteData.link_asana ?? '',
        agencia: clienteData.agencia ?? '',
        sdr: clienteData.sdr ?? '',
        closer: clienteData.closer ?? '',
        cnpj_vinculado: clienteData.cnpjVinculado ?? '',
        programa_fechado: '',
    });

    const [errors, setErrorsRaw] = useState<SharedClientFormErrors>({});
    const [valorContratoDisplay, setValorContratoDisplay] = useState(() =>
        clienteData.valorTotalContrato != null
            ? clienteData.valorTotalContrato.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : ''
    );
    const [serverError, setServerError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [detectedPais, setDetectedPais] = useState<string | undefined>(undefined);

    const set: FieldSetter = (key, value) => setFormRaw(prev => ({ ...prev, [key]: value }));

    function setErrors(updates: Partial<SharedClientFormErrors>) {
        setErrorsRaw(prev => ({ ...prev, ...updates }));
    }

    const hasContrato = !!clienteData.contratoId;

    function handleSalvar() {
        // Run the EXACT same validators as the registration page
        const e1 = validateCnpjEin(form.cnpj);
        const e2 = validatePhone(form.telefone);
        const e3 = validateAniversario(form.aniversario);
        const e4 = !form.estado ? 'Estado é obrigatório.' : undefined;
        const e5 = !form.cidade ? 'Cidade é obrigatória.' : undefined;
        const e6 = validateSegmento(form.segmento);
        const e7 = validateLinkAsana(form.link_asana);
        const e8 = validateListItem(form.agencia, AGENCIAS, 'Agência');
        const e9 = validateListItem(form.sdr, SDR_CLOSER, 'SDR');
        const e10 = validateListItem(form.closer, SDR_CLOSER, 'Closer');

        setErrors({ cnpj: e1, telefone: e2, aniversario: e3, estado: e4, cidade: e5, segmento: e6, link_asana: e7, agencia: e8, sdr: e9, closer: e10 });

        if (e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10) {
            setServerError('Corrija os erros de validação antes de salvar.');
            return;
        }

        if (!form.nome.trim()) {
            setServerError('Nome do cliente é obrigatório.');
            return;
        }

        const parsedContrato = valorContratoDisplay.trim() ? unmaskCurrency(valorContratoDisplay) : null;
        if (parsedContrato !== null && (isNaN(parsedContrato) || parsedContrato <= 0)) {
            setServerError('Valor total do contrato deve ser um número positivo.');
            return;
        }

        setServerError(null);
        startTransition(async () => {
            const res = await editarCliente(
                clienteData.clienteId,
                {
                    nome_cliente: form.nome.trim(),
                    empresa_label: form.empresa || null,
                    cnpj_contrato: form.cnpj || null,
                    telefone: form.telefone || null,
                    aniversario: form.aniversario || null,
                    pais: form.pais,
                    estado: form.estado || null,
                    cidade: form.cidade || null,
                    segmento: form.segmento || null,
                    link_asana: form.link_asana || null,
                    agencia: form.agencia || null,
                    sdr: form.sdr || null,
                    closer: form.closer || null,
                    cnpj_vinculado: form.cnpj_vinculado || null,
                },
                hasContrato && parsedContrato !== null ? {
                    contratoId: clienteData.contratoId!,
                    novoValorContrato: parsedContrato,
                } : undefined
            );

            if (res.ok) {
                onClose();
            } else {
                setServerError(res.error ?? 'Erro desconhecido.');
            }
        });
    }

    return (
        <ModalShell onClose={onClose}>
            <div className="space-y-6">

                {/* ── Dados do Cliente (shared block) ── */}
                <SectionTitle>Dados do Cliente</SectionTitle>
                <ClientDataFields
                    form={form}
                    set={set}
                    errors={errors}
                    setErrors={setErrors}
                    onCountryDetected={setDetectedPais}
                />

                {/* ── Localização (shared block) ── */}
                <SectionTitle>Localização</SectionTitle>
                <LocationFields
                    form={form}
                    set={set}
                    errors={errors}
                    setErrors={setErrors}
                    externalPais={detectedPais}
                />

                {/* ── Operação (shared block — only when contrato exists) ── */}
                {hasContrato && (
                    <>
                        <SectionTitle>Operação</SectionTitle>
                        <OperationFields
                            form={form}
                            set={set}
                            errors={errors}
                            setErrors={setErrors}
                        />
                    </>
                )}

                {/* ── Financeiro (admin only + contrato linked) ── */}
                {hasContrato && isAdmin && (
                    <>
                        <SectionTitle>Financeiro</SectionTitle>
                        <div>
                            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                Valor Total do Contrato
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold select-none">R$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={valorContratoDisplay}
                                    onChange={e => setValorContratoDisplay(maskCurrency(e.target.value))}
                                    placeholder="0,00"
                                    className={`${inp} pl-10 font-bold text-orange-400`}
                                />
                            </div>
                            <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">
                                Alterar reajustará automaticamente as parcelas em aberto.
                            </p>
                        </div>
                    </>
                )}

                {/* Error banner */}
                {serverError && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{serverError}</p>
                )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 justify-end mt-8">
                <button onClick={onClose} disabled={isPending} className="rounded-xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-all disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={handleSalvar} disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black px-6 py-2.5 text-sm font-bold transition-all disabled:opacity-50">
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                    {isPending ? 'Salvando…' : 'Salvar Alterações'}
                </button>
            </div>
        </ModalShell>
    );
}
