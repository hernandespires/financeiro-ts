'use client';

import { useState, useEffect } from 'react';
import { Lbl, FieldError, inp, inpErr } from '@/components/ui/FormFields';
import { maskCnpjEin, formatPhone } from '@/lib/masks';
import {
    validateCnpjEin,
    validatePhone,
    validateAniversario,
    getMax18YearsAgo,
} from '@/lib/validators';
import type {
    SharedClientFormState,
    SharedClientFormErrors,
    FieldSetter,
    ErrorSetter,
} from '@/lib/formTypes';

// ─── Props ────────────────────────────────────────────────────────────────────
interface ClientDataFieldsProps {
    form: Pick<SharedClientFormState, 'nome' | 'empresa' | 'cnpj' | 'telefone' | 'aniversario'>;
    set: FieldSetter;
    errors: Pick<SharedClientFormErrors, 'cnpj' | 'telefone' | 'aniversario'>;
    setErrors: ErrorSetter;
    /** Fires when phone prefix auto-detects a country label (e.g. "Brasil", "Estados Unidos") */
    onCountryDetected?: (paisLabel: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ClientDataFields({
    form,
    set,
    errors,
    setErrors,
    onCountryDetected,
}: ClientDataFieldsProps) {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => setIsMounted(true), []);

    function handleCnpjChange(raw: string) {
        set('cnpj', maskCnpjEin(raw));
        if (errors.cnpj) setErrors({ cnpj: undefined });
    }

    function handlePhoneChange(raw: string) {
        const formatted = formatPhone(raw);
        set('telefone', formatted);
        if (errors.telefone) setErrors({ telefone: undefined });

        // Auto-detect country from phone prefix for LocationFields to react
        if (formatted.startsWith('+55') && onCountryDetected) onCountryDetected('Brasil');
        else if (formatted.startsWith('+1') && onCountryDetected) onCountryDetected('Estados Unidos');
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Nome */}
            <div>
                <Lbl required>Nome do Cliente</Lbl>
                <input
                    value={form.nome}
                    onChange={e => set('nome', e.target.value)}
                    required
                    type="text"
                    placeholder="João da Silva"
                    className={inp}
                />
            </div>

            {/* Empresa */}
            <div>
                <Lbl required>Nome da Empresa</Lbl>
                <input
                    value={form.empresa}
                    onChange={e => set('empresa', e.target.value)}
                    required
                    type="text"
                    placeholder="ACME Corp LLC"
                    className={inp}
                />
            </div>

            {/* CNPJ / EIN */}
            <div>
                <Lbl required>CNPJ / EIN</Lbl>
                <input
                    value={form.cnpj}
                    onChange={e => handleCnpjChange(e.target.value)}
                    onBlur={() => setErrors({ cnpj: validateCnpjEin(form.cnpj) })}
                    type="text"
                    placeholder="XX-XXXXXXX ou XX.XXX.XXX/XXXX-XX"
                    className={errors.cnpj ? inpErr : inp}
                />
                <FieldError msg={errors.cnpj} />
            </div>

            {/* Telefone */}
            <div>
                <Lbl>Telefone</Lbl>
                <input
                    value={form.telefone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    onBlur={() => setErrors({ telefone: validatePhone(form.telefone) })}
                    type="tel"
                    placeholder="+1 (305) 555-0000"
                    className={errors.telefone ? inpErr : inp}
                />
                <FieldError msg={errors.telefone} />
            </div>

            {/* Aniversário */}
            <div className="sm:col-span-2">
                <Lbl>Data de Aniversário</Lbl>
                <input
                    value={form.aniversario}
                    onChange={e => {
                        set('aniversario', e.target.value);
                        if (errors.aniversario) setErrors({ aniversario: undefined });
                    }}
                    onBlur={() => setErrors({ aniversario: validateAniversario(form.aniversario) })}
                    type="date"
                    max={isMounted ? getMax18YearsAgo() : undefined}
                    className={`${errors.aniversario ? inpErr : inp} text-gray-300 w-1/2 cursor-text`}
                />
                <FieldError msg={errors.aniversario} />
            </div>
        </div>
    );
}
