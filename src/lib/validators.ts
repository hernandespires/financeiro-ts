// ─── Central validators ───────────────────────────────────────────────────────
// All return `string | undefined` (error message or clear).
// Shared by cadastro/page.tsx, EditarClienteModal, and any future forms.

import { SEGMENTOS } from '@/lib/constants';

// ─── CNPJ / EIN ──────────────────────────────────────────────────────────────
export function validateCnpjEin(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return 'CNPJ / EIN é obrigatório.';
    if (digits.length <= 9) {
        if (digits.length !== 9) return 'EIN deve ter exatamente 9 dígitos.';
    } else {
        if (digits.length !== 14) return 'CNPJ deve ter exatamente 14 dígitos.';
    }
    return undefined;
}

// ─── Phone ────────────────────────────────────────────────────────────────────
export function validatePhone(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 7)
        return 'Telefone deve ter ao menos 7 dígitos.';
    return undefined;
}

// ─── Birthday ─────────────────────────────────────────────────────────────────
export function getMax18YearsAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
}

export function validateAniversario(value: string): string | undefined {
    if (!value) return undefined;
    if (value > getMax18YearsAgo()) return 'O cliente deve ter ao menos 18 anos.';
    return undefined;
}

// ─── Contract start date ──────────────────────────────────────────────────────
export function getToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function validateDataInicio(value: string): string | undefined {
    if (!value) return 'Data de Início é obrigatória.';
    return undefined;
}

/** Expired-contract check used only for non-ANTIGO contract types */
export function validateDataInicioComPeriodo(
    value: string,
    periodoMeses: number,
    tipoContrato: string
): string | undefined {
    if (!value) return 'Data de Início é obrigatória.';
    // ANTIGO bypasses ALL checks — allows historical contracts fully expired
    if (tipoContrato === 'ANTIGO') return undefined;

    const fim = new Date(`${value}T12:00:00Z`);
    fim.setMonth(fim.getMonth() + periodoMeses);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (fim < hoje)
        return 'Este contrato já expirou. Para registrar contratos finalizados ou antigos, volte e selecione a opção Cliente Antigo.';
    return undefined;
}

// ─── Segmento ─────────────────────────────────────────────────────────────────
/** Strict: value must be exactly one of the SEGMENTOS constants */
export function validateSegmento(value: string): string | undefined {
    if (!value) return 'Segmento é obrigatório.';
    if (!(SEGMENTOS as readonly string[]).includes(value))
        return `Segmento inválido. Selecione uma opção válida da lista.`;
    return undefined;
}

// ─── Link Asana ───────────────────────────────────────────────────────────────
/** Strict: URL must contain "asana.com" */
export function validateLinkAsana(url: string): string | undefined {
    if (!url) return 'Link do controle de clientes é obrigatório.';
    if (!url.includes('asana.com')) return 'O link deve ser uma URL válida do Asana (asana.com).';
    return undefined;
}

// ─── Agência, SDR, Closer ─────────────────────────────────────────────────────
export function validateListItem(
    value: string,
    list: readonly string[],
    label: string
): string | undefined {
    if (!value) return `${label} é obrigatório(a).`;
    if (!list.includes(value)) return `Selecione um(a) ${label} válido(a) da lista.`;
    return undefined;
}
