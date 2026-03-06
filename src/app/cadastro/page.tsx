'use client';

import { useState, useMemo, useEffect } from 'react';
import { State, City } from 'country-state-city';
import { cadastrarClienteCompleto, DadosCadastroCompleto, TipoCadastro } from '@/actions/cadastro';

// ─── DROP-DOWN DATA ───────────────────────────────────────────────────────────

// País display labels → ISO codes used by country-state-city
const PAISES: { label: string; code: string }[] = [
    { label: 'Estados Unidos', code: 'US' },
    { label: 'Brasil', code: 'BR' },
];

const SEGMENTOS = ['PAINTING', 'CLEANING', 'ROOFING', 'LANDSCAPING', 'CONSTRUCTION', 'ENCANAÇÃO', 'ESTÉTICA'];

const SDR_CLOSER = [
    'Guilherme Rocha', 'Marcelo José', 'Matheus Freire', 'Isabela Pantaleão',
    'Lucas Valini', 'Aline Rúbio', 'Ana Luiza', 'Pedro Garcia', 'Vinicius Ribeiro',
    'Tainara', 'Igor Henrique', 'José Cleyvison (Keke)', 'TS', 'Thiago', 'Davi Rúbio',
];

const AGENCIAS = ['TS 01', 'TS 02', 'TS 03'];

const CNPJ_VINCULADO = [
    'AGÊNCIA TRAJETORIA DO SUCESSO LTDA',
    'ASSESSORIA DE MARKTING TS',
    'TS BUSSINES INC',
];

const FORMA_PAGAMENTO = [
    'STRIPE BRASIL', 'STRIPE EUA', 'IUGU', 'LOJA', 'PIX', 'APP DE TRANSFERÊNCIA', 'DINHEIRO',
];

const PERIODICIDADE = ['Mensal', 'Semanal', 'Quinzenal'];

const CATEGORIAS = [
    'BASE', 'UPSELL', 'PONTUAL', 'OUTROS', 'REEMBOLSO', 'RENOVAÇÕES', 'À VISTA', 'NOVOS CLIENTES',
];

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TypeCard { id: TipoCadastro; label: string; description: string; icon: React.ReactNode }

interface FormState {
    // Step 2
    nome: string; empresa: string; cnpj: string; telefone: string; aniversario: string;
    // Step 3
    pais: string; estado: string; cidade: string; segmento: string; link_asana: string;
    // Step 4
    agencia: string; sdr: string; closer: string; cnpj_vinculado: string; programa_fechado: string;
    // Step 5
    forma_pagamento: string; periodicidade: string; categoria_faturamento: string;
    data_inicio: string; porcentagem_imposto: string;
    valor_parcela_display: string;
    periodo_meses: string;
    parcelas_com_valor: string;
}

interface FieldErrors {
    cnpj?: string;
    telefone?: string;
    aniversario?: string;
    segmento?: string;
    estado?: string;
    cidade?: string;
    agencia?: string;
    sdr?: string;
    closer?: string;
    data_inicio?: string;
}

const EMPTY_FORM: FormState = {
    nome: '', empresa: '', cnpj: '', telefone: '', aniversario: '',
    pais: 'Estados Unidos', estado: '', cidade: '', segmento: '', link_asana: '',
    agencia: '', sdr: '', closer: '', cnpj_vinculado: '', programa_fechado: '',
    forma_pagamento: '', periodicidade: 'Mensal', categoria_faturamento: 'BASE',
    data_inicio: '', porcentagem_imposto: '',
    valor_parcela_display: '',
    periodo_meses: '',
    parcelas_com_valor: '',
};

// ─── VALIDATION HELPERS ──────────────────────────────────────────────────────

function validateCnpj(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return 'CNPJ / EIN é obrigatório.';
    if (digits.length <= 9) {
        if (digits.length !== 9) return 'EIN deve ter exatamente 9 dígitos.';
    } else {
        if (digits.length !== 14) return 'CNPJ deve ter exatamente 14 dígitos.';
    }
    return undefined;
}

function validatePhone(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 7) return 'Telefone deve ter ao menos 7 dígitos.';
    return undefined;
}

/** Returns the ISO date string for exactly 18 years ago from today. */
function getMax18YearsAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
}

function validateAniversario(value: string): string | undefined {
    if (!value) return undefined; // field is optional
    const max = getMax18YearsAgo();
    if (value > max) return 'O cliente deve ter ao menos 18 anos.';
    return undefined;
}

/** Returns today's date in YYYY-MM-DD (local timezone). */
function getToday(): string {
    const d = new Date();
    // Use local date parts to avoid UTC offset shifting the day
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function validateDataInicio(value: string): string | undefined {
    if (!value) return 'Data de Início é obrigatória.';
    if (value < getToday()) return 'A data de início não pode ser no passado.';
    return undefined;
}

// ─── MASKS ───────────────────────────────────────────────────────────────────

function maskCnpjEin(raw: string): string {
    const n = raw.replace(/\D/g, '').slice(0, 14);
    if (n.length <= 9) {
        return n.replace(/^(\d{2})(\d{0,7})$/, (_, a, b) => (b ? `${a}-${b}` : a));
    }
    return n
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

/**
 * Smart international phone formatter (E.164-aware).
 * - Auto-prepends '+' if the user types a bare digit.
 * - +55 (Brazil):      +55 (XX) XXXXX-XXXX
 * - +1  (US/Canada):   +1 (XXX) XXX-XXXX
 * - Other:             +CC XXXXXXXXXXXXXXXXX  (max 15 digits total, E.164)
 */
function formatPhone(raw: string): string {
    // Auto-prepend '+' when user starts typing digits without it
    const withPlus = raw === '' ? '' : (raw.startsWith('+') ? raw : '+' + raw);
    // Extract the pure digits (country code + number)
    const digits = withPlus.replace(/\D/g, '').slice(0, 15);
    if (!digits) return withPlus === '+' ? '+' : '';

    // ── Brazil: +55 ──────────────────────────────────────────────────────────
    if (digits.startsWith('55')) {
        const n = digits.slice(2); // strip country code
        if (n.length === 0) return '+55';
        if (n.length <= 2) return `+55 (${n}`;
        const area = n.slice(0, 2);
        const rest = n.slice(2);
        if (rest.length === 0) return `+55 (${area})`;
        if (rest.length <= 5) return `+55 (${area}) ${rest}`;
        return `+55 (${area}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }

    // ── US / Canada: +1 ──────────────────────────────────────────────────────
    if (digits.startsWith('1')) {
        const n = digits.slice(1);
        if (n.length === 0) return '+1';
        if (n.length <= 3) return `+1 (${n}`;
        const area = n.slice(0, 3);
        const mid = n.slice(3, 6);
        const last = n.slice(6, 10);
        if (!mid) return `+1 (${area})`;
        if (!last) return `+1 (${area}) ${mid}`;
        return `+1 (${area}) ${mid}-${last}`;
    }

    // ── Generic: +CC XXXXXXXXXXXXXXX ─────────────────────────────────────────
    // Separate a 1–3 digit country code from the subscriber number
    const cc = digits.slice(0, Math.min(3, digits.length));
    const sub = digits.slice(cc.length);
    return sub ? `+${cc} ${sub}` : `+${cc}`;
}

function maskCurrency(raw: string): string {
    const n = raw.replace(/\D/g, '');
    if (!n) return '';
    return (parseInt(n, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unmaskCurrency(masked: string): number {
    return parseFloat(masked.replace(/\./g, '').replace(',', '.')) || 0;
}

function maskPercent(raw: string): string {
    const clean = raw.replace(/[^0-9,]/g, '');
    const parts = clean.split(',');
    const integer = parts[0].slice(0, 3);
    const decimal = parts.length > 1 ? ',' + parts[1].slice(0, 2) : '';
    return integer + decimal;
}

function unmaskPercent(masked: string): number {
    return parseFloat(masked.replace(',', '.')) || 0;
}

// ─── ICONS ───────────────────────────────────────────────────────────────────

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

// ─── SHARED STYLES ────────────────────────────────────────────────────────────

const inp = 'w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors';
const inpErr = 'w-full bg-[#111] border border-red-500 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors';
const sel = `${inp} appearance-none`;
const lbl = 'block text-[11px] font-semibold text-amber-500 uppercase tracking-widest mb-1.5';

function Lbl({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return <label className={lbl}>{children}{required && <span className="text-red-400 ml-0.5">*</span>}</label>;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="mt-1 text-xs text-red-400 font-medium">{msg}</p>;
}

/** Native datalist-based searchable input with strict list validation on blur */
function SearchableSelect({
    label, name, value, onChange, onBlur, options, required, placeholder, listId, error,
}: {
    label: string; name: string; value: string; onChange: (v: string) => void;
    onBlur?: () => void;
    options: string[]; required?: boolean; placeholder?: string; listId: string;
    error?: string;
}) {
    return (
        <div>
            <Lbl required={required}>{label}</Lbl>
            <input
                name={name}
                value={value}
                required={required}
                placeholder={placeholder ?? '— Digite para buscar —'}
                list={listId}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
                autoComplete="off"
                className={error ? inpErr : inp}
            />
            <datalist id={listId}>
                {options.map(o => <option key={o} value={o} />)}
            </datalist>
            <FieldError msg={error} />
        </div>
    );
}

function SelectField({ label, name, value, onChange, options, required, placeholder }: {
    label: string; name: string; value: string;
    onChange: (v: string) => void; options: string[];
    required?: boolean; placeholder?: string;
}) {
    return (
        <div className="relative">
            <Lbl required={required}>{label}</Lbl>
            <select name={name} value={value} required={required} onChange={e => onChange(e.target.value)} className={sel}>
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
    return (
        <div className="w-full max-w-lg mx-auto mb-8">
            <p className="text-center text-xs font-bold text-amber-500 uppercase tracking-widest mb-3">
                {step}/{total} — {STEP_TITLES[step]}
            </p>
            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
                <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${(step / total) * 100}%` }}
                />
            </div>
        </div>
    );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function CadastroPage() {
    const [step, setStep] = useState(1);
    const [tipo, setTipo] = useState<TipoCadastro | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isPending, setIsPending] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const set = (key: keyof FormState, value: string) =>
        setForm(prev => ({ ...prev, [key]: value }));

    // ── Country → State → City cascade ──────────────────────────────────────
    // We store the ISO code internally for the library; we send `.name` to the DB.
    const [countryCode, setCountryCode] = useState<string>('US');
    const [stateCode, setStateCode] = useState<string>('');

    // ── Hydration guard ──────────────────────────────────────────────────────
    // Date helpers (getToday, getMax18YearsAgo) call `new Date()` which differs
    // between SSR (UTC) and the client (local timezone). We suppress the min/max
    // attributes on the server pass and apply them only after mount.
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    const availableStates = useMemo(
        () => State.getStatesOfCountry(countryCode),
        [countryCode]
    );

    const availableCities = useMemo(
        () => stateCode ? City.getCitiesOfState(countryCode, stateCode) : [],
        [countryCode, stateCode]
    );

    function handlePaisChange(label: string) {
        const country = PAISES.find(p => p.label === label);
        const code = country?.code ?? 'US';
        setCountryCode(code);
        setStateCode('');
        set('pais', label);
        set('estado', '');
        set('cidade', '');
    }

    function handleEstadoChange(isoCode: string) {
        setStateCode(isoCode);
        const stateName = availableStates.find(s => s.isoCode === isoCode)?.name ?? '';
        set('estado', stateName);
        set('cidade', '');
    }

    function handleCidadeChange(cityName: string) {
        set('cidade', cityName);
    }

    function showToast(type: 'success' | 'error', text: string) {
        setToast({ type, text });
        setTimeout(() => setToast(null), 5000);
    }

    function reset() {
        setStep(1);
        setTipo(null);
        setForm(EMPTY_FORM);
        setErrors({});
    }

    function goBack() {
        if (step === 2) { setStep(1); setTipo(null); }
        else setStep(s => s - 1);
    }

    function goNext() { setStep(s => s + 1); }

    // ── Blur validators ──────────────────────────────────────────────────────

    function handleCnpjBlur() {
        setErrors(prev => ({ ...prev, cnpj: validateCnpj(form.cnpj) }));
    }
    function handlePhoneBlur() {
        setErrors(prev => ({ ...prev, telefone: validatePhone(form.telefone) }));
    }
    function handleAniversarioBlur() {
        setErrors(prev => ({ ...prev, aniversario: validateAniversario(form.aniversario) }));
    }

    /** Datalist blur: clears field if the typed value isn't in the allowed list. */
    function makeListBlur(field: keyof FormState, list: string[]) {
        return () => {
            const v = form[field] as string;
            if (v && !list.includes(v)) {
                set(field, '');
                setErrors(prev => ({ ...prev, [field]: `Selecione uma opção válida da lista.` }));
            } else {
                setErrors(prev => ({ ...prev, [field]: undefined }));
            }
        };
    }

    // ── Step 2 submit: run all step-2 validations before advancing ───────────

    function handleStep2Submit(e: React.FormEvent) {
        e.preventDefault();
        const cnpjErr = validateCnpj(form.cnpj);
        const phoneErr = validatePhone(form.telefone);
        const anivErr = validateAniversario(form.aniversario);
        const newErrors: FieldErrors = { cnpj: cnpjErr, telefone: phoneErr, aniversario: anivErr };
        setErrors(newErrors);
        if (cnpjErr || phoneErr || anivErr) return;
        goNext();
    }

    // ── Step 3 submit: enforce required location fields ─────────────────────

    function handleStep3Submit(e: React.FormEvent) {
        e.preventDefault();
        const estadoErr = !form.estado ? 'Estado é obrigatório.' : undefined;
        const cidadeErr = !form.cidade ? 'Cidade é obrigatória.' : undefined;
        const segmentoErr = !SEGMENTOS.includes(form.segmento) ? 'Selecione um segmento válido.' : undefined;
        setErrors(prev => ({ ...prev, estado: estadoErr, cidade: cidadeErr, segmento: segmentoErr }));
        if (estadoErr || cidadeErr || segmentoErr) return;
        goNext();
    }

    // ── Step 4 submit: validate strict datalist fields before advancing ───────

    function handleStep4Submit(e: React.FormEvent) {
        e.preventDefault();
        const agenciaErr = !AGENCIAS.includes(form.agencia) ? 'Selecione uma agência válida.' : undefined;
        const sdrErr = !SDR_CLOSER.includes(form.sdr) ? 'Selecione um SDR válido.' : undefined;
        const closerErr = !SDR_CLOSER.includes(form.closer) ? 'Selecione um Closer válido.' : undefined;
        setErrors(prev => ({ ...prev, agencia: agenciaErr, sdr: sdrErr, closer: closerErr }));
        if (agenciaErr || sdrErr || closerErr) return;
        goNext();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!tipo || isPending) return;

        // Safety-net: re-run all validations before hitting the API
        const cnpjErr = validateCnpj(form.cnpj);
        const phoneErr = validatePhone(form.telefone);
        const anivErr = validateAniversario(form.aniversario);
        const segmentoErr = form.segmento && !SEGMENTOS.includes(form.segmento)
            ? 'Selecione um segmento válido.' : undefined;

        // ── Date validation: expiration shield (RECORRENTE, A_VISTA, PONTUAL only) ──
        // ANTIGO is explicitly for historical/finished contracts — skip expiration check.
        let dataInicioErr: string | undefined;

        if (!form.data_inicio) {
            dataInicioErr = 'Data de Início é obrigatória.';
        } else if (tipo !== 'ANTIGO') {
            const meses = parseInt(form.periodo_meses || '0', 10);
            const fim = new Date(`${form.data_inicio}T12:00:00Z`);
            fim.setMonth(fim.getMonth() + meses);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            if (fim < hoje) {
                dataInicioErr =
                    'A data de início e o período indicam que este contrato já expirou. Para registrar contratos finalizados, utilize a opção Cliente Antigo.';
            }
        }

        if (cnpjErr || phoneErr || anivErr || dataInicioErr || segmentoErr) {
            setErrors({
                cnpj: cnpjErr, telefone: phoneErr, aniversario: anivErr,
                data_inicio: dataInicioErr, segmento: segmentoErr,
            });
            showToast('error', 'Corrija os erros antes de finalizar o cadastro.');
            return;
        }

        setIsPending(true);

        const dados: DadosCadastroCompleto = {
            tipo_cadastro: tipo,
            nome: form.nome,
            empresa: form.empresa,
            cnpj: form.cnpj,
            telefone: form.telefone,
            aniversario: form.aniversario,
            pais: form.pais,
            estado: form.estado,
            cidade: form.cidade,
            segmento: form.segmento,
            link_asana: form.link_asana,
            agencia: form.agencia,
            sdr: form.sdr,
            closer: form.closer,
            cnpj_vinculado: form.cnpj_vinculado,
            programa_fechado: form.programa_fechado,
            forma_pagamento: form.forma_pagamento,
            periodicidade: form.periodicidade,
            data_inicio: form.data_inicio,
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
        } finally {
            setIsPending(false);
        }
    }

    const selectedCard = TYPE_CARDS.find(c => c.id === tipo);

    // Whether this type needs full financial fields (same as Recorrente)
    const isFullFinancial = tipo === 'RECORRENTE' || tipo === 'PONTUAL' || tipo === 'ANTIGO';

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">

            {/* TOAST */}
            {toast && (
                <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border text-sm font-medium max-w-sm animate-in fade-in slide-in-from-top-2 duration-300
          ${toast.type === 'success' ? 'bg-green-950 border-green-700 text-green-300' : 'bg-red-950 border-red-800 text-red-300'}`}>
                    <span className="text-lg">{toast.type === 'success' ? '✓' : '✕'}</span>
                    <span>{toast.text}</span>
                    <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100 text-base">✕</button>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
          STEP 1: SELECTION CARDS
      ══════════════════════════════════════════════════════════ */}
            {step === 1 && (
                <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3">Novo Cadastro</p>
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight text-center mb-3">
                        Qual o tipo de cliente?
                    </h1>
                    <p className="text-sm text-zinc-400 text-center mb-14 max-w-md">
                        Selecione o modelo de contrato para configurar os campos corretos automaticamente.
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
                        {TYPE_CARDS.map(card => (
                            <button
                                key={card.id}
                                onClick={() => { setTipo(card.id); goNext(); }}
                                className="group flex flex-col items-center gap-4 p-7 rounded-2xl border border-[#1f1f1f] bg-[#111] hover:bg-amber-500 hover:border-amber-500 hover:scale-[1.04] active:scale-100 transition-all duration-200 text-center"
                            >
                                <span className="text-amber-500 group-hover:text-black transition-colors duration-200">{card.icon}</span>
                                <div>
                                    <p className="font-bold text-white group-hover:text-black text-[15px] transition-colors">{card.label}</p>
                                    <p className="text-xs text-zinc-500 group-hover:text-black/70 mt-1.5 transition-colors leading-snug">{card.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
          STEPS 2–5: FORM
      ══════════════════════════════════════════════════════════ */}
            {step >= 2 && (
                <div className="max-w-2xl mx-auto px-4 py-12">

                    {/* Back + breadcrumb */}
                    <div className="flex items-center gap-3 mb-8">
                        <button
                            type="button"
                            onClick={goBack}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111] border border-[#2a2a2a] text-zinc-400 hover:text-amber-400 hover:border-amber-500 text-sm font-medium transition-all"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Voltar
                        </button>
                        <span className="text-sm text-zinc-600">
                            {selectedCard?.label}
                        </span>
                    </div>

                    {/* Progress */}
                    <ProgressBar step={step} total={5} />

                    {/* Card container */}
                    <div className="bg-[#111] border border-[#1f1f1f] rounded-2xl p-6 sm:p-8">

                        {/* ── STEP 2: DADOS DO CLIENTE ── */}
                        {step === 2 && (
                            <form onSubmit={handleStep2Submit} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div>
                                        <Lbl required>Nome do Cliente</Lbl>
                                        <input value={form.nome} onChange={e => set('nome', e.target.value)} required type="text" placeholder="João da Silva" className={inp} />
                                    </div>
                                    <div>
                                        <Lbl required>Nome da Empresa</Lbl>
                                        <input value={form.empresa} onChange={e => set('empresa', e.target.value)} required type="text" placeholder="ACME Corp LLC" className={inp} />
                                    </div>
                                    <div>
                                        <Lbl required>CNPJ / EIN</Lbl>
                                        <input
                                            value={form.cnpj}
                                            onChange={e => {
                                                set('cnpj', maskCnpjEin(e.target.value));
                                                if (errors.cnpj) setErrors(prev => ({ ...prev, cnpj: undefined }));
                                            }}
                                            onBlur={handleCnpjBlur}
                                            type="text"
                                            placeholder="XX-XXXXXXX ou XX.XXX.XXX/XXXX-XX"
                                            className={errors.cnpj ? inpErr : inp}
                                        />
                                        <FieldError msg={errors.cnpj} />
                                    </div>
                                    <div>
                                        <Lbl>Telefone</Lbl>
                                        <input
                                            value={form.telefone}
                                            onChange={e => {
                                                const formatted = formatPhone(e.target.value);
                                                set('telefone', formatted);
                                                // Auto-select País based on country code
                                                if (formatted.startsWith('+55')) handlePaisChange('Brasil');
                                                else if (formatted.startsWith('+1')) handlePaisChange('Estados Unidos');
                                                if (errors.telefone) setErrors(prev => ({ ...prev, telefone: undefined }));
                                            }}
                                            onBlur={handlePhoneBlur}
                                            type="tel"
                                            placeholder="+1 (305) 555-0000"
                                            className={errors.telefone ? inpErr : inp}
                                        />
                                        <FieldError msg={errors.telefone} />
                                    </div>
                                    <div>
                                        <Lbl>Data de Aniversário</Lbl>
                                        <input
                                            value={form.aniversario}
                                            onChange={e => {
                                                set('aniversario', e.target.value);
                                                if (errors.aniversario) setErrors(prev => ({ ...prev, aniversario: undefined }));
                                            }}
                                            onBlur={handleAniversarioBlur}
                                            type="date"
                                            max={isMounted ? getMax18YearsAgo() : undefined}
                                            className={`${errors.aniversario ? inpErr : inp} text-zinc-300`}
                                        />
                                        <FieldError msg={errors.aniversario} />
                                    </div>
                                </div>
                                <button type="submit" className="w-full mt-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm tracking-wide transition-all">
                                    Avançar →
                                </button>
                            </form>
                        )}

                        {/* ── STEP 3: LOCALIZAÇÃO ── */}
                        {step === 3 && (
                            <form onSubmit={handleStep3Submit} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                                    {/* País — always has a value, no error needed */}
                                    <div className="relative">
                                        <Lbl required>País</Lbl>
                                        <select
                                            value={form.pais}
                                            onChange={e => handlePaisChange(e.target.value)}
                                            className={sel}
                                        >
                                            {PAISES.map(p => (
                                                <option key={p.code} value={p.label}>{p.label}</option>
                                            ))}
                                        </select>
                                        <svg className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>

                                    {/* Estado — required */}
                                    <div className="relative">
                                        <Lbl required>Estado</Lbl>
                                        <select
                                            value={stateCode}
                                            onChange={e => { handleEstadoChange(e.target.value); if (errors.estado) setErrors(p => ({ ...p, estado: undefined })); }}
                                            disabled={availableStates.length === 0}
                                            className={`${errors.estado ? `${inpErr} appearance-none` : sel} disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <option value="">— Selecione —</option>
                                            {availableStates.map(s => (
                                                <option key={s.isoCode} value={s.isoCode}>{s.name}</option>
                                            ))}
                                        </select>
                                        <svg className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        <FieldError msg={errors.estado} />
                                    </div>

                                    {/* Cidade — required */}
                                    <div className="relative">
                                        <Lbl required>Cidade</Lbl>
                                        <select
                                            value={form.cidade}
                                            onChange={e => { handleCidadeChange(e.target.value); if (errors.cidade) setErrors(p => ({ ...p, cidade: undefined })); }}
                                            disabled={!stateCode || availableCities.length === 0}
                                            className={`${errors.cidade ? `${inpErr} appearance-none` : sel} disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <option value="">— Selecione —</option>
                                            {availableCities.map(c => (
                                                <option key={c.name} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                        <svg className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        <FieldError msg={errors.cidade} />
                                    </div>

                                    <SearchableSelect
                                        label="Segmento" name="segmento" value={form.segmento}
                                        onChange={v => { set('segmento', v); if (errors.segmento) setErrors(p => ({ ...p, segmento: undefined })); }}
                                        onBlur={makeListBlur('segmento', SEGMENTOS)}
                                        options={SEGMENTOS} required
                                        listId="segmento-list"
                                        placeholder="— Selecione ou digite —"
                                        error={errors.segmento}
                                    />
                                    <div className="sm:col-span-2">
                                        <Lbl required>Link do Controle de Clientes</Lbl>
                                        <div className="relative">
                                            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            <input value={form.link_asana} onChange={e => set('link_asana', e.target.value)} required type="url" placeholder="https://app.asana.com/..." className={`${inp} pl-10`} />
                                        </div>
                                    </div>
                                </div>
                                <button type="submit" className="w-full mt-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm tracking-wide transition-all">
                                    Avançar →
                                </button>
                            </form>
                        )}

                        {/* ── STEP 4: OPERAÇÃO ── */}
                        {step === 4 && (
                            <form onSubmit={handleStep4Submit} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <SearchableSelect
                                        label="Agência Responsável" name="agencia" value={form.agencia}
                                        onChange={v => { set('agencia', v); if (errors.agencia) setErrors(p => ({ ...p, agencia: undefined })); }}
                                        onBlur={makeListBlur('agencia', AGENCIAS)}
                                        options={AGENCIAS} required
                                        listId="agencia-list"
                                        error={errors.agencia}
                                    />
                                    <SearchableSelect
                                        label="SDR" name="sdr" value={form.sdr}
                                        onChange={v => { set('sdr', v); if (errors.sdr) setErrors(p => ({ ...p, sdr: undefined })); }}
                                        onBlur={makeListBlur('sdr', SDR_CLOSER)}
                                        options={SDR_CLOSER} required
                                        listId="sdr-list"
                                        error={errors.sdr}
                                    />
                                    <SearchableSelect
                                        label="CLOSER" name="closer" value={form.closer}
                                        onChange={v => { set('closer', v); if (errors.closer) setErrors(p => ({ ...p, closer: undefined })); }}
                                        onBlur={makeListBlur('closer', SDR_CLOSER)}
                                        options={SDR_CLOSER} required
                                        listId="closer-list"
                                        error={errors.closer}
                                    />
                                    <SelectField label="Contrato Vinculado ao CNPJ" name="cnpj_vinculado" value={form.cnpj_vinculado} onChange={v => set('cnpj_vinculado', v)} options={CNPJ_VINCULADO} placeholder="— Selecione —" required />
                                    <div className="sm:col-span-2 relative">
                                        <Lbl>Programa Fechado</Lbl>
                                        <select value={form.programa_fechado} onChange={e => set('programa_fechado', e.target.value)} className={sel}>
                                            <option value="">-- Nenhum / Opcional --</option>
                                            <option value="NO LIMITS">NO LIMITS</option>
                                            <option value="Programa Acelerador">Programa Acelerador</option>
                                        </select>
                                        <svg className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                                <button type="submit" className="w-full mt-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm tracking-wide transition-all">
                                    Avançar →
                                </button>
                            </form>
                        )}

                        {/* ── STEP 5: FINANCEIRO ── */}
                        {step === 5 && (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <SelectField label="Forma de Pagamento" name="forma_pagamento" value={form.forma_pagamento} onChange={v => set('forma_pagamento', v)} options={FORMA_PAGAMENTO} placeholder="— Selecione —" required />

                                    {/* Periodicidade: shown for Recorrente, Pontual, Antigo, and À Vista with >1 parcela */}
                                    {(isFullFinancial || (tipo === 'A_VISTA' && parseInt(form.parcelas_com_valor || '1', 10) > 1)) && (
                                        <SelectField label="Periodicidade das Parcelas" name="periodicidade" value={form.periodicidade} onChange={v => set('periodicidade', v)} options={PERIODICIDADE} required />
                                    )}

                                    {/* Categoria: shown for all types including Pontual */}
                                    {(isFullFinancial || tipo === 'A_VISTA') && (
                                        <SelectField label="Categoria" name="categoria_faturamento" value={form.categoria_faturamento} onChange={v => set('categoria_faturamento', v)} options={CATEGORIAS} required />
                                    )}

                                    <div>
                                        <Lbl required>Data de Início</Lbl>
                                        <input
                                            value={form.data_inicio}
                                            onChange={e => {
                                                set('data_inicio', e.target.value);
                                                if (errors.data_inicio) setErrors(p => ({ ...p, data_inicio: undefined }));
                                            }}
                                            required
                                            type="date"
                                            className={`${errors.data_inicio ? inpErr : inp} text-zinc-300`}
                                        />
                                        <FieldError msg={errors.data_inicio} />
                                    </div>
                                    <div>
                                        <Lbl>Porcentagem de Imposto</Lbl>
                                        <div className="relative">
                                            <input
                                                value={form.porcentagem_imposto}
                                                onChange={e => set('porcentagem_imposto', maskPercent(e.target.value))}
                                                type="text" inputMode="decimal" placeholder="22"
                                                className={`${inp} pr-9`}
                                            />
                                            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold select-none">%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <Lbl required>Valor Total do Contrato</Lbl>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold select-none">$</span>
                                            <input
                                                value={form.valor_parcela_display}
                                                onChange={e => set('valor_parcela_display', maskCurrency(e.target.value))}
                                                required type="text" placeholder="0,00"
                                                className={`${inp} pl-7`}
                                            />
                                        </div>
                                    </div>

                                    {/* Período do Contrato: shown for all types except none */}
                                    {(isFullFinancial || tipo === 'A_VISTA') && (
                                        <div>
                                            <Lbl required>Período do Contrato (Meses)</Lbl>
                                            <input
                                                value={form.periodo_meses}
                                                onChange={e => set('periodo_meses', e.target.value.replace(/\D/g, ''))}
                                                required type="text" inputMode="numeric" placeholder="12" className={inp}
                                            />
                                        </div>
                                    )}

                                    {/* À Vista — número de vezes */}
                                    {tipo === 'A_VISTA' && (
                                        <div>
                                            <Lbl>Dividir pagamento em (Ex: 1 ou 2 vezes)</Lbl>
                                            <input
                                                value={form.parcelas_com_valor}
                                                onChange={e => set('parcelas_com_valor', e.target.value.replace(/\D/g, ''))}
                                                type="text" inputMode="numeric" placeholder="1" className={inp}
                                            />
                                            <p className="mt-1 text-[10px] text-zinc-500">
                                                Nº de vezes que o valor total será dividido para cobrança.
                                            </p>
                                        </div>
                                    )}

                                </div>

                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="w-full mt-2 flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-900/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                                >
                                    {isPending ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Processando...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            Finalizar Cadastro
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}
