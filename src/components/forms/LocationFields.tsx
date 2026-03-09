'use client';

import { useState, useMemo, useEffect } from 'react';
import { State, City } from 'country-state-city';
import { PAISES, SEGMENTOS } from '@/lib/constants';
import { Lbl, FieldError, SearchableSelect, inp, inpErr, sel } from '@/components/ui/FormFields';
import { validateSegmento, validateLinkAsana } from '@/lib/validators';
import type {
    SharedClientFormState,
    SharedClientFormErrors,
    FieldSetter,
    ErrorSetter,
} from '@/lib/formTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveCountryCode(paisLabel: string): string {
    return PAISES.find(p => p.label === paisLabel)?.code ?? 'US';
}

function resolveStateCode(countryCode: string, stateName: string): string {
    if (!stateName) return '';
    return State.getStatesOfCountry(countryCode).find(s => s.name === stateName)?.isoCode ?? '';
}

// Shared chevron SVG
const Chevron = () => (
    <svg className="pointer-events-none absolute right-4 bottom-3.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface LocationFieldsProps {
    form: Pick<SharedClientFormState, 'pais' | 'estado' | 'cidade' | 'segmento' | 'link_asana'>;
    set: FieldSetter;
    errors: Pick<SharedClientFormErrors, 'estado' | 'cidade' | 'segmento' | 'link_asana'>;
    setErrors: ErrorSetter;
    /**
     * When provided, LocationFields will switch the country to match this label
     * (used by the phone-prefix auto-detect in ClientDataFields).
     */
    externalPais?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LocationFields({
    form,
    set,
    errors,
    setErrors,
    externalPais,
}: LocationFieldsProps) {
    // Internal cascade state
    const [countryCode, setCountryCode] = useState(() => resolveCountryCode(form.pais));
    const [stateCode, setStateCode] = useState(() => resolveStateCode(resolveCountryCode(form.pais), form.estado));

    // React to phone-driven country override
    useEffect(() => {
        if (!externalPais) return;
        const code = resolveCountryCode(externalPais);
        if (code !== countryCode) {
            setCountryCode(code);
            setStateCode('');
            set('pais', externalPais);
            set('estado', '');
            set('cidade', '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [externalPais]);

    const availableStates = useMemo(() => State.getStatesOfCountry(countryCode), [countryCode]);
    const availableCities = useMemo(
        () => (stateCode ? City.getCitiesOfState(countryCode, stateCode) : []),
        [countryCode, stateCode]
    );

    function handlePaisChange(label: string) {
        const code = resolveCountryCode(label);
        setCountryCode(code);
        setStateCode('');
        set('pais', label);
        set('estado', '');
        set('cidade', '');
    }

    function handleEstadoChange(iso: string) {
        setStateCode(iso);
        const stateName = State.getStatesOfCountry(countryCode).find(s => s.isoCode === iso)?.name ?? '';
        set('estado', stateName);
        set('cidade', '');
        if (errors.estado) setErrors({ estado: undefined });
    }

    function handleCidadeChange(cityName: string) {
        set('cidade', cityName);
        if (errors.cidade) setErrors({ cidade: undefined });
    }

    function handleSegmentoBlur() {
        setErrors({ segmento: validateSegmento(form.segmento) });
    }

    function handleLinkAsanaBlur() {
        setErrors({ link_asana: validateLinkAsana(form.link_asana) });
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* País */}
            <div className="relative">
                <Lbl required>País</Lbl>
                <select
                    value={form.pais}
                    onChange={e => handlePaisChange(e.target.value)}
                    className={sel}
                >
                    {PAISES.map(p => <option key={p.code} value={p.label}>{p.label}</option>)}
                </select>
                <Chevron />
            </div>

            {/* Estado */}
            <div className="relative">
                <Lbl required>Estado</Lbl>
                <select
                    value={stateCode}
                    onChange={e => handleEstadoChange(e.target.value)}
                    disabled={availableStates.length === 0}
                    className={`${errors.estado ? `${inpErr} appearance-none` : sel} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                    <option value="">— Selecione —</option>
                    {availableStates.map(s => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                </select>
                <Chevron />
                <FieldError msg={errors.estado} />
            </div>

            {/* Cidade */}
            <div className="relative">
                <Lbl required>Cidade</Lbl>
                <select
                    value={form.cidade}
                    onChange={e => handleCidadeChange(e.target.value)}
                    disabled={!stateCode || availableCities.length === 0}
                    className={`${errors.cidade ? `${inpErr} appearance-none` : sel} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                    <option value="">— Selecione —</option>
                    {availableCities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <Chevron />
                <FieldError msg={errors.cidade} />
            </div>

            {/* Segmento — strict, onBlur enforces exact match */}
            <SearchableSelect
                label="Segmento"
                name="segmento"
                value={form.segmento}
                onChange={v => {
                    set('segmento', v);
                    if (errors.segmento) setErrors({ segmento: undefined });
                }}
                onBlur={handleSegmentoBlur}
                options={SEGMENTOS}
                required
                listId="loc-segmento-list"
                placeholder="— Selecione ou digite —"
                error={errors.segmento}
            />

            {/* Link Asana — strictly validated */}
            <div className="sm:col-span-2">
                <Lbl required>Link do Controle de Clientes (Asana)</Lbl>
                <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <input
                        value={form.link_asana}
                        onChange={e => {
                            set('link_asana', e.target.value);
                            if (errors.link_asana) setErrors({ link_asana: undefined });
                        }}
                        onBlur={handleLinkAsanaBlur}
                        type="url"
                        placeholder="https://app.asana.com/..."
                        className={`${errors.link_asana ? inpErr : inp} pl-11`}
                    />
                </div>
                <FieldError msg={errors.link_asana} />
            </div>
        </div>
    );
}
