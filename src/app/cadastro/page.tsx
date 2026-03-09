'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cadastrarClienteCompleto, DadosCadastroCompleto, TipoCadastro } from '@/actions/cadastro';

import { FORMA_PAGAMENTO, PERIODICIDADE, CATEGORIAS } from '@/lib/constants';
import { maskCurrency, unmaskCurrency, maskPercent, unmaskPercent } from '@/lib/masks';
import {
    validateCnpjEin, validatePhone, validateAniversario,
    validateSegmento, validateLinkAsana, validateListItem,
    validateDataInicioComPeriodo, getToday,
} from '@/lib/validators';
import { SelectField, Lbl, FieldError, inp, inpErr } from '@/components/ui/FormFields';
import type { SharedClientFormState, SharedClientFormErrors } from '@/lib/formTypes';

import ClientDataFields from '@/components/forms/ClientDataFields';
import LocationFields from '@/components/forms/LocationFields';
import OperationFields from '@/components/forms/OperationFields';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TypeCard { id: TipoCadastro; label: string; description: string; icon: React.ReactNode }

/** Registration also has financial fields not in SharedClientFormState */
interface FinancialFields {
    forma_pagamento: string;
    periodicidade: string;
    categoria_faturamento: string;
    data_inicio: string;
    porcentagem_imposto: string;
    valor_parcela_display: string;
    periodo_meses: string;
    parcelas_com_valor: string;
}

type FullFormState = SharedClientFormState & FinancialFields;

interface ExtendedErrors extends SharedClientFormErrors {
    data_inicio?: string;
}

const EMPTY_FORM: FullFormState = {
    nome: '', empresa: '', cnpj: '', telefone: '', aniversario: '',
    pais: 'Estados Unidos', estado: '', cidade: '', segmento: '', link_asana: '',
    agencia: '', sdr: '', closer: '', cnpj_vinculado: '', programa_fechado: '',
    forma_pagamento: '', periodicidade: 'Mensal', categoria_faturamento: 'BASE',
    data_inicio: '', porcentagem_imposto: '', valor_parcela_display: '',
    periodo_meses: '', parcelas_com_valor: '',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconRecorrente = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-9 h-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);
const IconAvista = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-9 h-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
);
const IconPontual = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-9 h-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
    </svg>
);
const IconAntigo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-9 h-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

const TYPE_CARDS: TypeCard[] = [
    { id: 'RECORRENTE', label: 'Recorrente', description: 'Mensalidade contínua sem data de término', icon: <IconRecorrente /> },
    { id: 'A_VISTA', label: 'À Vista', description: 'Contrato com período definido e parcelas pagas upfront', icon: <IconAvista /> },
    { id: 'PONTUAL', label: 'Pontual', description: 'Projeto com início, fim e número fixo de parcelas', icon: <IconPontual /> },
    { id: 'ANTIGO', label: 'Cliente Antigo', description: 'Importação de cliente com contrato já em andamento', icon: <IconAntigo /> },
];

const STEP_TITLES = ['', 'Tipo de Projeto', 'Dados do Cliente', 'Localização', 'Operação', 'Financeiro'];

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
    return (
        <div className="w-full max-w-lg mx-auto mb-8">
            <p className="text-center text-xs font-bold text-orange-500 uppercase tracking-widest mb-3">
                {step}/{total} — {STEP_TITLES[step]}
            </p>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" style={{ width: `${(step / total) * 100}%` }} />
            </div>
        </div>
    );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function CadastroPage() {
    const [step, setStep] = useState(1);
    const [tipo, setTipo] = useState<TipoCadastro | null>(null);
    const [form, setForm] = useState<FullFormState>(EMPTY_FORM);
    const [errors, setErrorsRaw] = useState<ExtendedErrors>({});
    const [isPending, startTransition] = useTransition();
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ─── Detected country from phone prefix (wires ClientDataFields → LocationFields)
    const [detectedPais, setDetectedPais] = useState<string | undefined>(undefined);

    const set = (key: keyof FullFormState, value: string) =>
        setForm(prev => ({ ...prev, [key]: value }));

    function setErrors(updates: Partial<ExtendedErrors>) {
        setErrorsRaw(prev => ({ ...prev, ...updates }));
    }

    function showToast(type: 'success' | 'error', text: string) {
        setToast({ type, text });
        setTimeout(() => setToast(null), 5000);
    }

    function reset() {
        setStep(1); setTipo(null); setForm(EMPTY_FORM); setErrorsRaw({});
    }

    function goBack() {
        if (step === 2) { setStep(1); setTipo(null); }
        else setStep(s => s - 1);
    }

    // ─── Step transitions with strict validation ────────────────────────────

    function handleStep2Next(e: React.FormEvent) {
        e.preventDefault();
        const e1 = validateCnpjEin(form.cnpj);
        const e2 = validatePhone(form.telefone);
        const e3 = validateAniversario(form.aniversario);
        setErrors({ cnpj: e1, telefone: e2, aniversario: e3 });
        if (e1 || e2 || e3) return;
        setStep(s => s + 1);
    }

    function handleStep3Next(e: React.FormEvent) {
        e.preventDefault();
        const e1 = !form.estado ? 'Estado é obrigatório.' : undefined;
        const e2 = !form.cidade ? 'Cidade é obrigatória.' : undefined;
        const e3 = validateSegmento(form.segmento);
        const e4 = validateLinkAsana(form.link_asana);
        setErrors({ estado: e1, cidade: e2, segmento: e3, link_asana: e4 });
        if (e1 || e2 || e3 || e4) return;
        setStep(s => s + 1);
    }

    function handleStep4Next(e: React.FormEvent) {
        e.preventDefault();
        const { AGENCIAS, SDR_CLOSER } = require('@/lib/constants');
        const e1 = validateListItem(form.agencia, AGENCIAS, 'Agência');
        const e2 = validateListItem(form.sdr, SDR_CLOSER, 'SDR');
        const e3 = validateListItem(form.closer, SDR_CLOSER, 'Closer');
        setErrors({ agencia: e1, sdr: e2, closer: e3 });
        if (e1 || e2 || e3) return;
        setStep(s => s + 1);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!tipo || isPending) return;

        // Full re-validation across all steps
        const cnpjErr = validateCnpjEin(form.cnpj);
        const phoneErr = validatePhone(form.telefone);
        const anivErr = validateAniversario(form.aniversario);
        const segmentoErr = validateSegmento(form.segmento);
        const asanaErr = validateLinkAsana(form.link_asana);
        const { AGENCIAS, SDR_CLOSER } = require('@/lib/constants');
        const agenciaErr = validateListItem(form.agencia, AGENCIAS, 'Agência');
        const sdrErr = validateListItem(form.sdr, SDR_CLOSER, 'SDR');
        const closerErr = validateListItem(form.closer, SDR_CLOSER, 'Closer');
        const dataInicioErr = validateDataInicioComPeriodo(
            form.data_inicio,
            parseInt(form.periodo_meses || '0', 10),
            tipo
        );

        if (cnpjErr || phoneErr || anivErr || segmentoErr || asanaErr || agenciaErr || sdrErr || closerErr || dataInicioErr) {
            setErrors({ cnpj: cnpjErr, telefone: phoneErr, aniversario: anivErr, segmento: segmentoErr, link_asana: asanaErr, agencia: agenciaErr, sdr: sdrErr, closer: closerErr, data_inicio: dataInicioErr });
            showToast('error', 'Corrija os erros antes de finalizar o cadastro.');
            return;
        }

        startTransition(async () => {
            const dados: DadosCadastroCompleto = {
                tipo_cadastro: tipo, nome: form.nome, empresa: form.empresa, cnpj: form.cnpj,
                telefone: form.telefone, aniversario: form.aniversario, pais: form.pais,
                estado: form.estado, cidade: form.cidade, segmento: form.segmento, link_asana: form.link_asana,
                agencia: form.agencia, sdr: form.sdr, closer: form.closer, cnpj_vinculado: form.cnpj_vinculado,
                programa_fechado: form.programa_fechado, forma_pagamento: form.forma_pagamento,
                periodicidade: form.periodicidade, data_inicio: form.data_inicio,
                valor_total: unmaskCurrency(form.valor_parcela_display),
                periodo_meses: parseInt(form.periodo_meses || '0', 10),
                porcentagem_imposto: unmaskPercent(form.porcentagem_imposto),
                categoria_faturamento: form.categoria_faturamento,
                parcelas_com_valor: form.parcelas_com_valor ? parseInt(form.parcelas_com_valor, 10) : undefined,
            };
            try {
                const res = await cadastrarClienteCompleto(dados);
                if (res.sucesso) {
                    showToast('success', res.mensagem ?? 'Cliente cadastrado com sucesso!');
                    setTimeout(reset, 2500);
                } else {
                    showToast('error', res.erro ?? 'Erro ao cadastrar. Tente novamente.');
                }
            } catch {
                showToast('error', 'Erro inesperado. Verifique a conexão.');
            }
        });
    }

    const selectedCard = TYPE_CARDS.find(c => c.id === tipo);
    const isFullFinancial = tipo === 'RECORRENTE' || tipo === 'PONTUAL' || tipo === 'ANTIGO';

    const btnOrange = 'w-full mt-4 py-4 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-black font-black text-sm uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]';

    return (
        <div className="min-h-screen text-white font-sans pb-16">

            {/* TOAST */}
            {toast && (
                <div className={`fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border text-sm font-medium max-w-sm animate-in fade-in slide-in-from-top-4 duration-300 backdrop-blur-md ${toast.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white">{toast.type === 'success' ? '✓' : '✕'}</span>
                    <span>{toast.text}</span>
                    <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
                </div>
            )}

            {/* ── STEP 1: Type selection ── */}
            {step === 1 && (
                <div className="flex flex-col items-center justify-center pt-8 px-4">
                    <nav className="flex items-center gap-2 text-xs w-full max-w-4xl mb-12">
                        <Link href="/" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
                        <span className="text-gray-600">/</span>
                        <Link href="/consultar-clientes" className="text-gray-400 hover:text-white transition-colors">Consultar Clientes</Link>
                        <span className="text-gray-600">/</span>
                        <span className="text-orange-500 font-semibold">Novo Cadastro</span>
                    </nav>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Novo Cadastro</p>
                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight text-center mb-3">Qual o tipo de cliente?</h1>
                    <p className="text-sm text-gray-400 text-center mb-14 max-w-md">Selecione o modelo de contrato para configurar os campos corretos automaticamente.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
                        {TYPE_CARDS.map(card => (
                            <button key={card.id} onClick={() => { setTipo(card.id); setStep(2); }} className="group flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/[0.02] backdrop-blur-xl border border-white/10 hover:border-orange-500/50 hover:bg-white/[0.04] hover:scale-[1.03] active:scale-100 transition-all duration-300 text-center shadow-xl">
                                <span className="text-orange-500 group-hover:text-orange-400 group-hover:scale-110 transition-all duration-300">{card.icon}</span>
                                <div>
                                    <p className="font-bold text-white text-base">{card.label}</p>
                                    <p className="text-xs text-gray-500 group-hover:text-gray-400 mt-2 leading-relaxed">{card.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── STEPS 2–5 ── */}
            {step >= 2 && (
                <div className="max-w-2xl mx-auto px-4 pt-8">
                    <nav className="flex items-center gap-2 text-xs mb-8">
                        <Link href="/" className="text-gray-400 hover:text-white">Dashboard</Link>
                        <span className="text-gray-600">/</span>
                        <Link href="/consultar-clientes" className="text-gray-400 hover:text-white">Consultar Clientes</Link>
                        <span className="text-gray-600">/</span>
                        <span className="text-orange-500 font-semibold">Novo Cadastro</span>
                    </nav>
                    <div className="flex items-center justify-between mb-8">
                        <button type="button" onClick={goBack} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500 hover:bg-white/10 text-gray-400 hover:text-orange-400 px-4 py-2 text-xs font-medium transition-all">
                            <ArrowLeft size={14} /> Etapa Anterior
                        </button>
                        <span className="text-xs font-bold text-gray-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">{selectedCard?.label}</span>
                    </div>
                    <ProgressBar step={step} total={5} />

                    <div className="rounded-3xl bg-white/[0.02] backdrop-blur-xl border border-white/15 p-6 sm:p-10 shadow-2xl">

                        {/* ── Step 2: Dados do Cliente ── */}
                        {step === 2 && (
                            <form onSubmit={handleStep2Next} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ClientDataFields
                                    form={form}
                                    set={set as any}
                                    errors={errors}
                                    setErrors={setErrors}
                                    onCountryDetected={setDetectedPais}
                                />
                                <button type="submit" className={btnOrange}>Avançar</button>
                            </form>
                        )}

                        {/* ── Step 3: Localização ── */}
                        {step === 3 && (
                            <form onSubmit={handleStep3Next} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <LocationFields
                                    form={form}
                                    set={set as any}
                                    errors={errors}
                                    setErrors={setErrors}
                                    externalPais={detectedPais}
                                />
                                <button type="submit" className={btnOrange}>Avançar</button>
                            </form>
                        )}

                        {/* ── Step 4: Operação ── */}
                        {step === 4 && (
                            <form onSubmit={handleStep4Next} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <OperationFields
                                    form={form}
                                    set={set as any}
                                    errors={errors}
                                    setErrors={setErrors}
                                />
                                <button type="submit" className={btnOrange}>Avançar</button>
                            </form>
                        )}

                        {/* ── Step 5: Financeiro (no shared block — registration-only fields) ── */}
                        {step === 5 && (
                            <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <SelectField label="Forma de Pagamento" name="forma_pagamento" value={form.forma_pagamento} onChange={v => set('forma_pagamento', v)} options={FORMA_PAGAMENTO} placeholder="— Selecione —" required />
                                    {(isFullFinancial || (tipo === 'A_VISTA' && parseInt(form.parcelas_com_valor || '1', 10) > 1)) && (
                                        <SelectField label="Periodicidade das Parcelas" name="periodicidade" value={form.periodicidade} onChange={v => set('periodicidade', v)} options={PERIODICIDADE} required />
                                    )}
                                    {(isFullFinancial || tipo === 'A_VISTA') && (
                                        <SelectField label="Categoria" name="categoria_faturamento" value={form.categoria_faturamento} onChange={v => set('categoria_faturamento', v)} options={CATEGORIAS} required />
                                    )}
                                    <div>
                                        <Lbl required>Data de Início</Lbl>
                                        <input value={form.data_inicio} onChange={e => { set('data_inicio', e.target.value); if (errors.data_inicio) setErrors({ data_inicio: undefined }); }} required type="date" className={`${errors.data_inicio ? inpErr : inp} text-gray-300 cursor-text`} />
                                        <FieldError msg={errors.data_inicio} />
                                    </div>
                                    <div>
                                        <Lbl>Porcentagem de Imposto</Lbl>
                                        <div className="relative">
                                            <input value={form.porcentagem_imposto} onChange={e => set('porcentagem_imposto', maskPercent(e.target.value))} type="text" inputMode="decimal" placeholder="22" className={`${inp} pr-10`} />
                                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold select-none">%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Lbl required>Valor Total do Contrato</Lbl>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold select-none">R$</span>
                                            <input value={form.valor_parcela_display} onChange={e => set('valor_parcela_display', maskCurrency(e.target.value))} required type="text" placeholder="0,00" className={`${inp} pl-10 font-bold text-orange-400`} />
                                        </div>
                                    </div>
                                    {(isFullFinancial || tipo === 'A_VISTA') && (
                                        <div>
                                            <Lbl required>Período do Contrato (Meses)</Lbl>
                                            <input value={form.periodo_meses} onChange={e => set('periodo_meses', e.target.value.replace(/\D/g, ''))} required type="text" inputMode="numeric" placeholder="12" className={inp} />
                                        </div>
                                    )}
                                    {tipo === 'A_VISTA' && (
                                        <div className="sm:col-span-2">
                                            <Lbl>Dividir pagamento em (Ex: 1 ou 2 vezes)</Lbl>
                                            <input value={form.parcelas_com_valor} onChange={e => set('parcelas_com_valor', e.target.value.replace(/\D/g, ''))} type="text" inputMode="numeric" placeholder="1" className={`${inp} w-1/2`} />
                                        </div>
                                    )}
                                </div>
                                <button type="submit" disabled={isPending} className={`${btnOrange} flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    {isPending
                                        ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Processando...</>
                                        : <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Finalizar Cadastro</>
                                    }
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}