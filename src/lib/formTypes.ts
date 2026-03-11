// ─── Shared form types used by cadastro/page.tsx and EditarClienteModal ───────
// Both the registration wizard (steps 2-4) and the edit modal adhere to these.

export interface SharedClientFormState {
    nome: string;
    empresa: string;
    cnpj: string;
    telefone: string;
    aniversario: string;
    pais: string;
    estado: string;
    cidade: string;
    segmento: string;
    link_asana: string;
    agencia: string;
    sdr: string;
    closer: string;
    cnpj_vinculado: string;
    programa_fechado: string;
    // A_VISTA 2x split fields (optional — registration-only)
    parcela2_data?: string;
    parcela2_valor_display?: string;
}

export interface SharedClientFormErrors {
    nome?: string;
    cnpj?: string;
    telefone?: string;
    aniversario?: string;
    estado?: string;
    cidade?: string;
    segmento?: string;
    link_asana?: string;
    agencia?: string;
    sdr?: string;
    closer?: string;
}

/** Generic updater used by all shared form blocks */
export type FieldSetter = (field: keyof SharedClientFormState, value: string) => void;
export type ErrorSetter = (updates: Partial<SharedClientFormErrors>) => void;
