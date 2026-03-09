// ─── Input masks, formatters, and validators ──────────────────────────────────
// Shared across Registration page, Edit modal, and any other form.

// ─── Masks ───────────────────────────────────────────────────────────────────

export function maskCnpjEin(raw: string): string {
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

export function formatPhone(raw: string): string {
    const withPlus = raw === '' ? '' : (raw.startsWith('+') ? raw : '+' + raw);
    const digits = withPlus.replace(/\D/g, '').slice(0, 15);
    if (!digits) return withPlus === '+' ? '+' : '';

    if (digits.startsWith('55')) {
        const n = digits.slice(2);
        if (n.length === 0) return '+55';
        if (n.length <= 2) return `+55 (${n}`;
        const area = n.slice(0, 2);
        const rest = n.slice(2);
        if (rest.length === 0) return `+55 (${area})`;
        if (rest.length <= 5) return `+55 (${area}) ${rest}`;
        return `+55 (${area}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }

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

    const cc = digits.slice(0, Math.min(3, digits.length));
    const sub = digits.slice(cc.length);
    return sub ? `+${cc} ${sub}` : `+${cc}`;
}

/** Centavo-based currency mask: "1250" → "12,50" */
export function maskCurrency(raw: string): string {
    const n = raw.replace(/\D/g, '');
    if (!n) return '';
    return (parseInt(n, 10) / 100).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Parse masked currency back to number: "1.250,00" → 1250 */
export function unmaskCurrency(masked: string): number {
    return parseFloat(masked.replace(/\./g, '').replace(',', '.')) || 0;
}

/** Percentage mask — allows up to 3 integer digits + 2 decimal places */
export function maskPercent(raw: string): string {
    const clean = raw.replace(/[^0-9,]/g, '');
    const parts = clean.split(',');
    const integer = parts[0].slice(0, 3);
    const decimal = parts.length > 1 ? ',' + parts[1].slice(0, 2) : '';
    return integer + decimal;
}

export function unmaskPercent(masked: string): number {
    return parseFloat(masked.replace(',', '.')) || 0;
}

// ─── Validators ──────────────────────────────────────────────────────────────

export function validateCnpj(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 0) return 'CNPJ / EIN é obrigatório.';
    if (digits.length <= 9) {
        if (digits.length !== 9) return 'EIN deve ter exatamente 9 dígitos.';
    } else {
        if (digits.length !== 14) return 'CNPJ deve ter exatamente 14 dígitos.';
    }
    return undefined;
}

export function validatePhone(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 7) return 'Telefone deve ter ao menos 7 dígitos.';
    return undefined;
}

function getMax18YearsAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split('T')[0];
}

export function validateAniversario(value: string): string | undefined {
    if (!value) return undefined;
    const max = getMax18YearsAgo();
    if (value > max) return 'O cliente deve ter ao menos 18 anos.';
    return undefined;
}
