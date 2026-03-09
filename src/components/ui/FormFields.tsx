'use client';

// ─── Shared form UI atoms ─────────────────────────────────────────────────────
// Re-usable across Registration page, Edit modals, and anywhere else.
// Keeps the "iOS Dark Glass" aesthetic from cadastro.tsx.

export const inp =
    'w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-colors';

export const inpErr =
    'w-full bg-red-500/10 border border-red-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors';

export const sel = `${inp} appearance-none cursor-pointer`;

export const lbl =
    'block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2';

// ─── Label ────────────────────────────────────────────────────────────────────
export function Lbl({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className={lbl}>
            {children}
            {required && <span className="text-orange-500 ml-1">*</span>}
        </label>
    );
}

// ─── Inline validation error ──────────────────────────────────────────────────
export function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return (
        <p className="mt-1.5 text-[11px] text-red-400 font-medium bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md inline-block">
            {msg}
        </p>
    );
}

// ─── Searchable datalist input ────────────────────────────────────────────────
export function SearchableSelect({
    label, name, value, onChange, onBlur, options,
    required, placeholder, listId, error,
}: {
    label: string;
    name: string;
    value: string;
    onChange: (v: string) => void;
    onBlur?: () => void;
    options: readonly string[];
    required?: boolean;
    placeholder?: string;
    listId: string;
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

// ─── Plain select field with chevron ─────────────────────────────────────────
export function SelectField({
    label, name, value, onChange, options, required, placeholder, error,
}: {
    label: string;
    name: string;
    value: string;
    onChange: (v: string) => void;
    options: readonly string[];
    required?: boolean;
    placeholder?: string;
    error?: string;
}) {
    return (
        <div className="relative">
            <Lbl required={required}>{label}</Lbl>
            <select
                name={name}
                value={value}
                required={required}
                onChange={e => onChange(e.target.value)}
                className={error ? `${inpErr} appearance-none` : sel}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <svg
                className="pointer-events-none absolute right-4 bottom-3.5 h-4 w-4 text-gray-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <FieldError msg={error} />
        </div>
    );
}
