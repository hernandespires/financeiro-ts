'use client';

import { SDR_CLOSER, AGENCIAS, CNPJ_VINCULADO } from '@/lib/constants';
import { SearchableSelect, SelectField } from '@/components/ui/FormFields';
import { validateListItem } from '@/lib/validators';
import type {
    SharedClientFormState,
    SharedClientFormErrors,
    FieldSetter,
    ErrorSetter,
} from '@/lib/formTypes';

// ─── Props ────────────────────────────────────────────────────────────────────
interface OperationFieldsProps {
    form: Pick<SharedClientFormState, 'agencia' | 'sdr' | 'closer' | 'cnpj_vinculado' | 'programa_fechado'>;
    set: FieldSetter;
    errors: Pick<SharedClientFormErrors, 'agencia' | 'sdr' | 'closer'>;
    setErrors: ErrorSetter;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OperationFields({
    form,
    set,
    errors,
    setErrors,
}: OperationFieldsProps) {
    const sel =
        'w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-colors appearance-none cursor-pointer';

    function makeBlur(field: 'agencia' | 'sdr' | 'closer', list: readonly string[], label: string) {
        return () => setErrors({ [field]: validateListItem(form[field], list, label) });
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Agência */}
            <SearchableSelect
                label="Agência Responsável"
                name="agencia"
                value={form.agencia}
                onChange={v => { set('agencia', v); if (errors.agencia) setErrors({ agencia: undefined }); }}
                onBlur={makeBlur('agencia', AGENCIAS, 'Agência')}
                options={AGENCIAS}
                required
                listId="op-agencia-list"
                error={errors.agencia}
            />

            {/* SDR */}
            <SearchableSelect
                label="SDR"
                name="sdr"
                value={form.sdr}
                onChange={v => { set('sdr', v); if (errors.sdr) setErrors({ sdr: undefined }); }}
                onBlur={makeBlur('sdr', SDR_CLOSER, 'SDR')}
                options={SDR_CLOSER}
                required
                listId="op-sdr-list"
                error={errors.sdr}
            />

            {/* Closer */}
            <SearchableSelect
                label="Closer"
                name="closer"
                value={form.closer}
                onChange={v => { set('closer', v); if (errors.closer) setErrors({ closer: undefined }); }}
                onBlur={makeBlur('closer', SDR_CLOSER, 'Closer')}
                options={SDR_CLOSER}
                required
                listId="op-closer-list"
                error={errors.closer}
            />

            {/* CNPJ Vinculado */}
            <SelectField
                label="Contrato Vinculado ao CNPJ"
                name="cnpj_vinculado"
                value={form.cnpj_vinculado}
                onChange={v => set('cnpj_vinculado', v)}
                options={CNPJ_VINCULADO}
                placeholder="— Selecione —"
                required
            />

            {/* Programa Fechado */}
            <div className="sm:col-span-2 relative">
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                    Programa Fechado
                </label>
                <select
                    value={form.programa_fechado}
                    onChange={e => set('programa_fechado', e.target.value)}
                    className={sel}
                >
                    <option value="">-- Nenhum / Opcional --</option>
                    <option value="NO LIMITS">NO LIMITS</option>
                    <option value="Programa Acelerador">Programa Acelerador</option>
                </select>
                <svg className="pointer-events-none absolute right-4 bottom-3.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
