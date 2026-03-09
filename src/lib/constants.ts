// ─── Shared constants used across Registration, Edit Modal, and other forms ───

/** País display labels → ISO codes used by country-state-city */
export const PAISES: { label: string; code: string }[] = [
    { label: 'Estados Unidos', code: 'US' },
    { label: 'Brasil', code: 'BR' },
];

export const SEGMENTOS = [
    'PAINTING', 'CLEANING', 'ROOFING', 'LANDSCAPING',
    'CONSTRUCTION', 'ENCANAÇÃO', 'ESTÉTICA',
] as const;

export const SDR_CLOSER = [
    'Guilherme Rocha', 'Marcelo José', 'Matheus Freire', 'Isabela Pantaleão',
    'Lucas Valini', 'Aline Rúbio', 'Ana Luiza', 'Pedro Garcia', 'Vinicius Ribeiro',
    'Tainara', 'Igor Henrique', 'José Cleyvison (Keke)', 'TS', 'Thiago', 'Davi Rúbio',
] as const;

export const AGENCIAS = ['TS 01', 'TS 02', 'TS 03'] as const;

export const CNPJ_VINCULADO = [
    'AGÊNCIA TRAJETORIA DO SUCESSO LTDA',
    'ASSESSORIA DE MARKTING TS',
    'TS BUSSINES INC',
] as const;

export const FORMA_PAGAMENTO = [
    'STRIPE BRASIL', 'STRIPE EUA', 'IUGU', 'LOJA', 'PIX',
    'APP DE TRANSFERÊNCIA', 'DINHEIRO',
] as const;

export const PERIODICIDADE = ['Mensal', 'Semanal', 'Quinzenal'] as const;

export const CATEGORIAS = [
    'BASE', 'UPSELL', 'PONTUAL', 'OUTROS',
    'REEMBOLSO', 'RENOVAÇÕES', 'À VISTA', 'NOVOS CLIENTES',
] as const;

export const PROGRAMAS = ['NO LIMITS', 'Programa Acelerador'] as const;

// Helper: convert readonly tuple to mutable string[] for consumers that need it
export type Segmento = typeof SEGMENTOS[number];
export type Agencia = typeof AGENCIAS[number];
