/**
 * ============================================================================
 * src/lib/financeRules.ts
 * ============================================================================
 *
 * THE SINGLE SOURCE OF TRUTH FOR ALL BUSINESS RULES.
 *
 * If a financial rule, status, threshold, calculation, or permission changes,
 * it is changed HERE and ONLY here. Every page, action, and component imports
 * from this file — they never hardcode rule logic themselves.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SECTIONS
 * ──────────────────────────────────────────────────────────────────────────────
 *  1.  STATUS CONSTANTS      — All DB enum strings, typed and named
 *  2.  BUSINESS THRESHOLDS   — Day counts and percentages that drive rules
 *  3.  CLEARING SCHEDULES    — Per-platform payment hold periods
 *  4.  FORECAST EXCLUSION    — Which statuses block cash-flow forecasts
 *  5.  ACTION PERMISSIONS    — What can / cannot be done to a parcela
 *  6.  FINANCIAL MATH        — Juros, payment breakdown, clearing date
 *  7.  STATUS DETERMINATION  — Risk level from days-late
 *  8.  FORECAST GUARDS       — isParcelaValidaParaPrevisao, getContratosSujos
 *  9.  CONTRACT MATH         — valor_total adjustments, debt statements
 * 10.  DB SYNC ENGINE        — syncFinanceStatuses (runs on page load)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ⚠️  DATABASE ENUM VALUES (enum_status_manual)
 *
 * All STATUS_PARCELA values below must exist in the Supabase DB enum.
 * Run /supabase/migrations/add_missing_enum_values.sql if not yet done.
 *
 * ── CONTAGION NOMENCLATURE RULE ──
 * All contagion statuses (applied automatically to subsequent installments)
 * use the "POSSUI" prefix:
 *   Root INADIMPLENTE       → subsequent parcelas = "POSSUI INADIMPLENCIA"
 *   Root PERDA DE FATURAMENTO → subsequent parcelas = "POSSUI PERDA"
 * ============================================================================
 */

import { daysLate } from "./utils";

// ============================================================================
// SECTION 1 — STATUS CONSTANTS
// ============================================================================
//
// These strings must match the Supabase enum values EXACTLY (case-sensitive).
// NEVER hardcode these strings in pages, components, or actions.
// Always import from here so a rename only requires a single change.
//
// ============================================================================

/**
 * STATUS_PARCELA
 *
 * Every possible value of `parcelas.status_manual_override`.
 *
 * ── Lifecycle of a normal installment ──
 *   NORMAL
 *   → (1–14d late) ATRASADO
 *   → (15–29d) INADIMPLENTE            [contagion: next parcelas → POSSUI INADIMPLENCIA]
 *   → (30+d) PERDA DE FATURAMENTO      [contagion: next parcelas → POSSUI PERDA]
 *   → Manual: QUEBRA DE CONTRATO
 *   → Payment at any step: PAGO or INADIMPLENTE RECEBIDO
 *
 * ── Lifecycle of a renewal marker ──
 *   RENOVAR CONTRATO (placeholder, R$0)
 *   → "Não Renovar" clicked in time → FINALIZAR PROJETO
 *   → Inside 20-day window: auto-confirms → real installment value assigned
 *   → "Renovar" clicked → RENOVADO (old marker); new contract created
 */
export const STATUS_PARCELA = {
  /** In-date. The default state. Counts in forecast. */
  NORMAL: "NORMAL",

  /** 1–14 days past due. Still counts in forecast. Set by sync engine. */
  ATRASADO: "ATRASADO",

  /**
   * 15–29 days past due. The ROOT overdue installment.
   * Does NOT count in forecast.
   * Triggers POSSUI contagion: all subsequent open parcelas of the same
   * contract receive POSSUI_INADIMPLENCIA.
   */
  INADIMPLENTE: "INADIMPLENTE",

  /**
   * CONTAGION STATUS — Applied automatically to all subsequent open parcelas
   * when a ROOT installment in the same contract becomes INADIMPLENTE (15–29d).
   *
   * Does NOT count in forecast.
   * BLOCKS "Dar Baixa" — the root INADIMPLENTE must be paid first.
   * (Regra de Contágio)
   */
  POSSUI_INADIMPLENCIA: "POSSUI INADIMPLENCIA",

  /**
   * 30+ days past due. The ROOT loss installment.
   * Does NOT count in forecast.
   * Triggers POSSUI contagion: all subsequent open parcelas → POSSUI_PERDA.
   */
  PERDA_FATURAMENTO: "PERDA DE FATURAMENTO",

  /**
   * CONTAGION STATUS — Applied automatically to all subsequent open parcelas
   * when a ROOT installment in the same contract reaches PERDA (30+d).
   *
   * Does NOT count in forecast.
   * BLOCKS "Dar Baixa" — the root PERDA DE FATURAMENTO must be paid first.
   * (Regra de Contágio)
   */
  POSSUI_PERDA: "POSSUI PERDA",

  /**
   * Manual legal action applied by the financeiro team.
   * Can ONLY be applied to a client who is already INADIMPLENTE.
   *
   * Effects:
   *   1. clientes.status_cliente → QUEBRA DE CONTRATO
   *   2. ALL unpaid parcelas of the client's contracts → QUEBRA DE CONTRATO
   *   3. Interest accrues dynamically in real-time forever from data_vencimento
   *   4. System generates a live debt statement (calcularExtratoQuebraContrato)
   *
   * Does NOT count in forecast.
   */
  QUEBRA_CONTRATO: "QUEBRA DE CONTRATO",

  /**
   * Placeholder installment (valor = R$0) added automatically at the end of
   * every contract cycle. Signals "this contract needs renewal action".
   *
   * Resolution paths:
   *   a) Fora da janela de 20 dias + "Não Renovar" → FINALIZAR_PROJETO
   *   b) Dentro da janela de 20 dias → auto-confirms (gains real valor_bruto)
   *   c) "Renovar" clicked → changes to RENOVADO; new contract created
   *
   * Counts in forecast as a placeholder. Does NOT contribute real revenue.
   */
  RENOVAR_CONTRATO: "RENOVAR CONTRATO",

  /**
   * Terminal. The old RENOVAR_CONTRATO marker after a renewal was confirmed.
   * Historical record only. NOT in forecast.
   */
  RENOVADO: "RENOVADO",

  /**
   * Applied when "Não Renovar" is clicked BEFORE the 20-day lock window.
   * Business language: "Contrato Encerrado".
   *
   * clientes.status_cliente also changes to CONTRATO_ENCERRADO.
   * Does NOT count in forecast.
   */
  FINALIZAR_PROJETO: "FINALIZAR PROJETO",

  /** One-time contract installment. Treated as a single-charge block. */
  CONTRATO_A_VISTA: "CONTRATO À VISTA",

  /**
   * Payment successfully registered. Funds are in transit or landed.
   * ALWAYS counts in forecast as booked, confirmed revenue.
   */
  PAGO: "PAGO",

  /**
   * Payment collected after a period of default.
   * The client was late but eventually paid.
   * Counts in forecast as recovered revenue.
   */
  INADIMPLENTE_RECEBIDO: "INADIMPLENTE RECEBIDO",
} as const;

export type StatusParcela = (typeof STATUS_PARCELA)[keyof typeof STATUS_PARCELA];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * STATUS_CLIENTE
 *
 * Every possible value of `clientes.status_cliente`.
 *
 * Auto-managed by syncFinanceStatuses (escalates only):
 *   ATIVO → ATRASADO → INADIMPLENTE
 *
 * Manually set (never overwritten by sync engine):
 *   QUEBRA_CONTRATO | CONTRATO_ENCERRADO | CHECKOUT | INATIVO
 */
export const STATUS_CLIENTE = {
  /** All installments current. Counts in forecast. */
  ATIVO: "ATIVO",

  /** At least one installment 1–14 days late. Still counts in forecast. */
  ATRASADO: "ATRASADO",

  /** At least one installment 15+ days late. Does NOT count in forecast. */
  INADIMPLENTE: "INADIMPLENTE",

  /** Contract legally breached. Manual. Does NOT count in forecast. */
  QUEBRA_CONTRATO: "QUEBRA DE CONTRATO",

  /** Client chose not to renew before the 20-day lock window. Does NOT count. */
  CONTRATO_ENCERRADO: "CONTRATO ENCERRADO",

  /** Client in offboarding. Does NOT count in forecast. */
  CHECKOUT: "CHECKOUT",

  /** Archived / inactive. Does NOT count in forecast. */
  INATIVO: "INATIVO",
} as const;

export type StatusCliente = (typeof STATUS_CLIENTE)[keyof typeof STATUS_CLIENTE];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * STATUS_PAGAMENTO
 *
 * Every possible value of `pagamentos.status_pagamento`.
 */
export const STATUS_PAGAMENTO = {
  /**
   * Registered but funds still held by platform (Stripe / Iugu).
   * Appears in cash-flow forecast on clearing date using "Valor Pago".
   *   Stripe Brasil: 5 calendar days
   *   Iugu: 3 business days
   */
  PROCESSANDO: "PROCESSANDO",

  /** Clearing period elapsed (or PIX — always instant). Funds available. */
  RECEBIDO: "RECEBIDO",
} as const;

export type StatusPagamento =
  (typeof STATUS_PAGAMENTO)[keyof typeof STATUS_PAGAMENTO];

// ============================================================================
// SECTION 2 — BUSINESS THRESHOLDS
// ============================================================================

/**
 * DIAS_LIMITE_ATRASO
 * Day 1 through day 14 = ATRASADO (late but recoverable).
 * Day 15+ = INADIMPLENTE.
 * Rule: "Atrasada: Passou do vencimento, com atraso de até 15 dias."
 */
export const DIAS_LIMITE_ATRASO = 14;

/**
 * DIAS_INICIO_INADIMPLENCIA
 * On day 15 the installment becomes INADIMPLENTE.
 * Triggers POSSUI contagion on all subsequent open parcelas.
 */
export const DIAS_INICIO_INADIMPLENCIA = 15;

/**
 * DIAS_INICIO_PERDA
 * On day 30+ the installment becomes PERDA DE FATURAMENTO.
 * Triggers POSSUI PERDA contagion.
 */
export const DIAS_INICIO_PERDA = 30;

/**
 * DIAS_INICIO_JUROS
 * Interest only starts after this many days past due.
 * Rule: "cobrados em 1,5% ao mês, mas apenas após 10 dias de atraso."
 */
export const DIAS_INICIO_JUROS = 10;

/**
 * JUROS_MENSAL_PERCENTUAL
 * 1.5% per 30-day period (simple interest, not compound).
 * Applied from DIAS_INICIO_JUROS onwards.
 *
 * Formula: meses = floor((diasAtraso - DIAS_INICIO_JUROS) / 30) + 1
 *          juros  = valorBase × (1.5 / 100) × meses
 *
 * Example on R$ 10,000:
 *   Day 10  → 1 month  → 1.5%  → R$ 150   → Total R$ 10,150
 *   Day 40  → 2 months → 3.0%  → R$ 300   → Total R$ 10,300
 *   Day 120 → 4 months → 6.0%  → R$ 600   → Total R$ 10,600
 *   Day 730 → 24 months→ 36%   → R$ 3,600 → Total R$ 13,600 (2 years)
 *
 * For Quebra de Contrato this never stops accruing.
 */
export const JUROS_MENSAL_PERCENTUAL = 1.5;

/**
 * DIAS_JANELA_RENOVACAO
 * The client must give notice at least this many days before the next
 * due date to cancel a renewal. Inside this window the renewal is automatic.
 *
 * Rule: "O cliente tem a obrigação de avisar com 20 dias de antecedência."
 *
 * Example: RENOVAR_CONTRATO parcela due 01/04. Today = 13/03 (19 days left).
 * Window has passed → renewal is automatic → "Não Renovar" button disabled.
 * Today = 09/03 (23 days left) → outside window → button enabled.
 */
export const DIAS_JANELA_RENOVACAO = 20;

// ============================================================================
// SECTION 3 — CLEARING SCHEDULES (Payment Platform Hold Periods)
// ============================================================================

/**
 * How many days funds are held by each payment platform after a transaction.
 * Determines data_disponibilidade_prevista (when money lands in bank account).
 *
 * — STRIPE BRASIL : +5 calendar days (includes weekends)
 * — IUGU          : +3 business days (Mon–Fri, no Sat/Sun)
 * — Everything else (PIX, STRIPE EUA, DINHEIRO, LOJA, APP): D+0 (instant)
 */
export const CLEARING_SCHEDULE: Record<
  string,
  { tipo: "calendário" | "úteis" | "imediato"; dias: number }
> = {
  "STRIPE BRASIL": { tipo: "calendário", dias: 5 },
  IUGU: { tipo: "úteis", dias: 3 },
  PIX: { tipo: "imediato", dias: 0 },
  "STRIPE EUA": { tipo: "imediato", dias: 0 },
  DINHEIRO: { tipo: "imediato", dias: 0 },
  LOJA: { tipo: "imediato", dias: 0 },
  "APP DE TRANSFERÊNCIA": { tipo: "imediato", dias: 0 },
};

// ============================================================================
// SECTION 4 — FORECAST EXCLUSION SETS
// ============================================================================

/**
 * STATUSES_PARCELA_EXCLUIDOS_PREVISAO
 *
 * Installment statuses that represent dead debt, terminal states, or
 * non-billable placeholders.
 *
 * A parcela with ANY of these statuses must be COMPLETELY excluded from:
 *   - Previsão de Caixa KPIs (totalCaixa, totalRecebido, totalPendente)
 *   - All chart bars and platform breakdowns
 *   - Any revenue projection on any page
 *
 * THIS IS THE ABSOLUTE FIREWALL. Do not remove entries without full
 * business owner approval.
 */
export const STATUSES_PARCELA_EXCLUIDOS_PREVISAO = new Set<string>([
  // Dead debt — root overdue installments
  STATUS_PARCELA.INADIMPLENTE,
  STATUS_PARCELA.PERDA_FATURAMENTO,

  // Dead debt — POSSUI contagion-infected subsequent installments
  STATUS_PARCELA.POSSUI_INADIMPLENCIA,
  STATUS_PARCELA.POSSUI_PERDA,

  // Legal breach — interest accrues but revenue is uncertain
  STATUS_PARCELA.QUEBRA_CONTRATO,

  // Non-billable terminal states
  STATUS_PARCELA.RENOVAR_CONTRATO, // placeholder (no real value yet)
  STATUS_PARCELA.FINALIZAR_PROJETO, // churn / contract ended
  STATUS_PARCELA.RENOVADO, // historical terminal marker
]);

/**
 * STATUSES_CLIENTE_EXCLUIDOS_PREVISAO
 *
 * Clients with these statuses are hidden from Dashboard KPIs and the
 * Previsão de Caixa. Their installments must not contribute to expected revenue.
 */
export const STATUSES_CLIENTE_EXCLUIDOS_PREVISAO = new Set<string>([
  STATUS_CLIENTE.INADIMPLENTE,
  STATUS_CLIENTE.QUEBRA_CONTRATO,
  STATUS_CLIENTE.CONTRATO_ENCERRADO,
  STATUS_CLIENTE.CHECKOUT,
  STATUS_CLIENTE.INATIVO,
]);

/**
 * STATUSES_NAO_MOSTRAR_NA_LISTA
 *
 * Installment statuses hidden from Mesa de Operações (contas-a-receber/lista).
 * These are terminal / operational markers with no actionable meaning there.
 */
export const STATUSES_NAO_MOSTRAR_NA_LISTA = new Set<string>([
  STATUS_PARCELA.RENOVAR_CONTRATO,
  STATUS_PARCELA.FINALIZAR_PROJETO,
  STATUS_PARCELA.QUEBRA_CONTRATO,
  STATUS_PARCELA.RENOVADO,
]);

/**
 * STATUSES_PROTEGIDOS_SYNC
 *
 * These parcela statuses must NEVER be overwritten by the automatic
 * syncFinanceStatuses engine. They represent terminal or manually-set
 * states that must persist as-is.
 */
export const STATUSES_PROTEGIDOS_SYNC = new Set<string>([
  STATUS_PARCELA.PAGO,
  STATUS_PARCELA.INADIMPLENTE_RECEBIDO,
  STATUS_PARCELA.RENOVAR_CONTRATO,
  STATUS_PARCELA.FINALIZAR_PROJETO,
  STATUS_PARCELA.QUEBRA_CONTRATO,
  STATUS_PARCELA.RENOVADO,
  STATUS_PARCELA.CONTRATO_A_VISTA,
]);

// ============================================================================
// SECTION 5 — ACTION PERMISSIONS MATRIX
// ============================================================================
//
// Import and call these in BOTH Server Actions (security) AND UI components
// (button visibility). Never duplicate this logic anywhere else.
//
// ============================================================================

/**
 * canDarBaixa
 *
 * ALLOWED:
 *   NORMAL, ATRASADO — standard installments.
 *   INADIMPLENTE — root overdue, can be regularized.
 *   PERDA_FATURAMENTO — root loss, can still be collected.
 *
 * BLOCKED — Regra de Contágio (UI must show Modal de Bloqueio):
 *   POSSUI_INADIMPLENCIA — must pay root INADIMPLENTE first.
 *   POSSUI_PERDA — must pay root PERDA DE FATURAMENTO first.
 *
 * BLOCKED — already settled:
 *   PAGO, INADIMPLENTE_RECEBIDO, hasPagamento === true
 *
 * BLOCKED — non-billable:
 *   QUEBRA_CONTRATO, FINALIZAR_PROJETO, RENOVADO, RENOVAR_CONTRATO
 *
 * @returns { allowed, reason } — reason is machine-readable for UI Modal routing:
 *   'JA_PAGA'                 → show "already paid" message
 *   'CONTAGIO_INADIMPLENCIA'  → show BlockModal pointing to root INADIMPLENTE
 *   'CONTAGIO_PERDA'          → show BlockModal pointing to root PERDA
 *   'STATUS_TERMINAL'         → show generic "non-actionable" message
 */
export function canDarBaixa(
  statusParcela: string,
  hasPagamento: boolean
): { allowed: boolean; reason?: string } {
  if (hasPagamento) return { allowed: false, reason: "JA_PAGA" };

  if (
    statusParcela === STATUS_PARCELA.PAGO ||
    statusParcela === STATUS_PARCELA.INADIMPLENTE_RECEBIDO
  ) {
    return { allowed: false, reason: "JA_PAGA" };
  }

  // ── CONTAGION BLOCK — Regra de Contágio ──────────────────────────────────
  if (statusParcela === STATUS_PARCELA.POSSUI_INADIMPLENCIA) {
    return { allowed: false, reason: "CONTAGIO_INADIMPLENCIA" };
  }
  if (statusParcela === STATUS_PARCELA.POSSUI_PERDA) {
    return { allowed: false, reason: "CONTAGIO_PERDA" };
  }

  if (
    statusParcela === STATUS_PARCELA.QUEBRA_CONTRATO ||
    statusParcela === STATUS_PARCELA.FINALIZAR_PROJETO ||
    statusParcela === STATUS_PARCELA.RENOVADO ||
    statusParcela === STATUS_PARCELA.RENOVAR_CONTRATO
  ) {
    return { allowed: false, reason: "STATUS_TERMINAL" };
  }

  // ALLOWED: NORMAL, ATRASADO, INADIMPLENTE, PERDA_FATURAMENTO
  return { allowed: true };
}

/**
 * canEditarParcela
 *
 * Allowed for any open (unpaid) installment.
 * Blocked if a pagamentos record exists (installment is in the ledger).
 */
export function canEditarParcela(hasPagamento: boolean): {
  allowed: boolean;
  reason?: string;
} {
  if (hasPagamento) {
    return { allowed: false, reason: "Parcelas já pagas não podem ser editadas." };
  }
  return { allowed: true };
}

/**
 * canExcluirParcela
 *
 * Allowed for any open (unpaid) installment.
 * Blocked if a pagamentos record exists (has entered the ledger).
 * Soft delete: sets deleted_at and deducts valor_bruto from contract total.
 */
export function canExcluirParcela(hasPagamento: boolean): {
  allowed: boolean;
  reason?: string;
} {
  if (hasPagamento) {
    return { allowed: false, reason: "Parcelas já pagas não podem ser excluídas." };
  }
  return { allowed: true };
}

/**
 * canDesmembrarParcela
 *
 * Allowed on ORIGINAL installments (sub_indice === 0 or null) that are unpaid.
 *
 * A split creates TWO sub-installments preserving total value:
 *   Original → sub_indice = 1 (keeps novoValorPrimeira)
 *   New row  → sub_indice = 2 (keeps remaining balance)
 *
 * Cannot split a sub-installment (sub_indice > 0) — prevents infinite
 * fragmentation. Cannot split paid installments.
 */
export function canDesmembrarParcela(
  subIndice: number | null | undefined,
  hasPagamento: boolean
): { allowed: boolean; reason?: string } {
  if (hasPagamento) {
    return { allowed: false, reason: "Parcelas já pagas não podem ser divididas." };
  }
  if (subIndice !== null && subIndice !== undefined && subIndice > 0) {
    return {
      allowed: false,
      reason: "Não é possível dividir uma sub-parcela (já foi dividida anteriormente).",
    };
  }
  return { allowed: true };
}

/**
 * canNaoRenovar
 *
 * "Não Renovar" is only available when today is OUTSIDE the 20-day lock window
 * (i.e., there are MORE than DIAS_JANELA_RENOVACAO days left until due date).
 *
 * Inside the lock window (diasAteVencimento < 20):
 *   → Renewal is AUTOMATIC. Button must be hidden.
 *   → The RENOVAR_CONTRATO parcela gains its real valor_bruto.
 *   → contratos.parcelas_total increments (e.g., 6/6 → 7/7).
 *   → contratos.valor_total_contrato increases.
 *
 * Outside the lock window (diasAteVencimento >= 20):
 *   → Button is enabled. Clicking sets status → FINALIZAR_PROJETO.
 *   → clientes.status_cliente → CONTRATO_ENCERRADO.
 *
 * @param dataVencimento "YYYY-MM-DD" — due date of the RENOVAR_CONTRATO installment
 * @param todayStr       "YYYY-MM-DD" — today's date
 */
export function canNaoRenovar(
  dataVencimento: string,
  todayStr: string
): {
  allowed: boolean;
  diasAteVencimento: number;
  renovacaoAutomatica: boolean;
} {
  const due = new Date(dataVencimento + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const diasAteVencimento = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const renovacaoAutomatica = diasAteVencimento < DIAS_JANELA_RENOVACAO;
  return { allowed: !renovacaoAutomatica, diasAteVencimento, renovacaoAutomatica };
}

/**
 * canAplicarQuebraContrato
 *
 * Can ONLY be applied to a client who is already INADIMPLENTE.
 * (PERDA DE FATURAMENTO maps to INADIMPLENTE at the client level.)
 */
export function canAplicarQuebraContrato(statusCliente: string): {
  allowed: boolean;
  reason?: string;
} {
  if (statusCliente === STATUS_CLIENTE.INADIMPLENTE) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "Quebra de Contrato só pode ser aplicada a clientes com status Inadimplente.",
  };
}

// ============================================================================
// SECTION 6 — FINANCIAL MATH
// ============================================================================

/**
 * calcularJuros
 *
 * Calculates interest on a late installment.
 *
 * Rules:
 * — No interest before DIAS_INICIO_JUROS (day 10).
 * — 1.5% per 30-day period (simple interest on original base amount).
 * — Each new 30-day block from day 10 adds one period.
 * — For Quebra de Contrato: call with real-time diasAtraso from data_vencimento.
 *   The total grows indefinitely every 30 days.
 *
 * @param valorBase  Original installment amount (valor_bruto or valor_previsto)
 * @param diasAtraso Days past due (positive = late; 0 or negative = no interest)
 *
 * @example
 *   calcularJuros(10000,   9) → { juros:    0, meses: 0, totalComJuros: 10000 }
 *   calcularJuros(10000,  10) → { juros:  150, meses: 1, totalComJuros: 10150 }
 *   calcularJuros(10000,  40) → { juros:  300, meses: 2, totalComJuros: 10300 }
 *   calcularJuros(10000, 120) → { juros:  600, meses: 4, totalComJuros: 10600 }
 *   calcularJuros(10000, 730) → { juros: 3600, meses:24, totalComJuros: 13600 }
 */
export function calcularJuros(
  valorBase: number,
  diasAtraso: number
): { juros: number; meses: number; totalComJuros: number } {
  if (diasAtraso < DIAS_INICIO_JUROS) {
    return { juros: 0, meses: 0, totalComJuros: valorBase };
  }
  const meses = Math.floor((diasAtraso - DIAS_INICIO_JUROS) / 30) + 1;
  const juros = parseFloat(
    (valorBase * (JUROS_MENSAL_PERCENTUAL / 100) * meses).toFixed(2)
  );
  return { juros, meses, totalComJuros: parseFloat((valorBase + juros).toFixed(2)) };
}

/**
 * calcularMathPagamento
 *
 * The Payment Mathematics — how every real is split.
 * Rule 6: "A Matemática do Pagamento".
 *
 *   Valor Bruto     = debt (valor_previsto + any juros)
 *   Valor Pago      = what client sent to the platform
 *   Taxa Plataforma = gateway retention = valorBruto - valorPago
 *   Imposto Real    = ALWAYS on valorPago (never on gross)
 *   Liquidez Real   = valorPago - impostoRetido (what TS keeps)
 *
 * @example
 *   calcularMathPagamento(10000, 9800, 22)
 *   → { taxaPlataforma: 200, impostoRetido: 2156, valorLiquidoReal: 7644 }
 */
export function calcularMathPagamento(
  valorBruto: number,
  valorPago: number,
  impostoPercent: number
): { taxaPlataforma: number; impostoRetido: number; valorLiquidoReal: number } {
  const taxaPlataforma = parseFloat((valorBruto - valorPago).toFixed(2));
  const impostoRetido = parseFloat((valorPago * (impostoPercent / 100)).toFixed(2));
  const valorLiquidoReal = parseFloat((valorPago - impostoRetido).toFixed(2));
  return { taxaPlataforma, impostoRetido, valorLiquidoReal };
}

/**
 * calcularDataDisponibilidade
 *
 * Returns the clearing date (when funds land in the bank account) based on
 * the payment platform's hold period (Section 3 above).
 *
 * This is the SINGLE source of truth for data_disponibilidade_prevista.
 * Called when:
 *   1. A parcela is created (cadastro / renovacao)
 *   2. A payment is registered (registrarPagamentoCompleto)
 *   3. A parcela's due date is edited (editarParcela)
 *   4. A platform change ripples to open parcelas
 *
 * @param dataBaseStr    "YYYY-MM-DD" — due date or actual payment date
 * @param formaPagamento  From contratos.forma_pagamento
 * @returns              "YYYY-MM-DD" — clearing date
 */
export function calcularDataDisponibilidade(
  dataBaseStr: string,
  formaPagamento: string
): string {
  const date = new Date(dataBaseStr + "T12:00:00");
  const forma = formaPagamento.toUpperCase();

  if (forma === "STRIPE BRASIL") {
    date.setDate(date.getDate() + CLEARING_SCHEDULE["STRIPE BRASIL"].dias);
  } else if (forma === "IUGU") {
    let added = 0;
    while (added < CLEARING_SCHEDULE["IUGU"].dias) {
      date.setDate(date.getDate() + 1);
      const dow = date.getDay();
      if (dow !== 0 && dow !== 6) added++; // skip Sat (6) and Sun (0)
    }
  }
  // PIX, STRIPE EUA, DINHEIRO, LOJA, APP → instant (D+0)

  return date.toISOString().split("T")[0];
}

// ============================================================================
// SECTION 7 — STATUS DETERMINATION
// ============================================================================

/** Display-level risk classification for UI components. */
export type RiskLevel = "EM DIA" | "ATRASO" | "INADIMPLENTE" | "PERDA";

/**
 * calcularDiasAtraso
 * Positive = late, 0 = due today, negative = future. Args: "YYYY-MM-DD".
 */
export function calcularDiasAtraso(
  dataVencimento: string,
  dataReferenciaStr: string
): number {
  return daysLate(dataVencimento, dataReferenciaStr);
}

/**
 * getRiskStatus
 *
 * Classifies a parcela's display risk level from days-late count.
 * Used by UI components (StatusPill, RiskBadge) and the sync engine.
 *
 *   ≤ 0d      → 'EM DIA'
 *   1–14d     → 'ATRASO'
 *   15–29d    → 'INADIMPLENTE'
 *   30+d      → 'PERDA'
 */
export function getRiskStatus(diasAtraso: number): RiskLevel {
  if (diasAtraso >= DIAS_INICIO_PERDA) return "PERDA";
  if (diasAtraso >= DIAS_INICIO_INADIMPLENCIA) return "INADIMPLENTE";
  if (diasAtraso >= 1) return "ATRASO";
  return "EM DIA";
}

/**
 * getStatusParcelaFromDias
 * Returns the DB-safe STATUS_PARCELA value for a days-late count.
 * Used by syncFinanceStatuses to write the correct enum back to DB.
 */
export function getStatusParcelaFromDias(diasAtraso: number): string {
  if (diasAtraso >= DIAS_INICIO_PERDA) return STATUS_PARCELA.PERDA_FATURAMENTO;
  if (diasAtraso >= DIAS_INICIO_INADIMPLENCIA) return STATUS_PARCELA.INADIMPLENTE;
  if (diasAtraso >= 1) return STATUS_PARCELA.ATRASADO;
  return STATUS_PARCELA.NORMAL;
}

/**
 * getContagionStatus
 *
 * Given a ROOT overdue status, returns the POSSUI contagion status to
 * propagate to all SUBSEQUENT open installments of the same contract.
 *
 *   INADIMPLENTE root      → POSSUI_INADIMPLENCIA
 *   PERDA_FATURAMENTO root → POSSUI_PERDA
 *   ATRASADO root          → null (ATRASADO does NOT trigger contagion)
 */
export function getContagionStatus(rootStatus: string): string | null {
  if (rootStatus === STATUS_PARCELA.PERDA_FATURAMENTO) return STATUS_PARCELA.POSSUI_PERDA;
  if (rootStatus === STATUS_PARCELA.INADIMPLENTE) return STATUS_PARCELA.POSSUI_INADIMPLENCIA;
  return null;
}

// ============================================================================
// SECTION 8 — FORECAST GUARDS
// ============================================================================

/**
 * isNotDeleted
 * True only if parcela, its contract, and its client are all non-deleted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotDeleted(parcela: any): boolean {
  if (parcela.deleted_at != null) return false;
  if (parcela.contratos) {
    if (parcela.contratos.deleted_at != null) return false;
    const cliente = Array.isArray(parcela.contratos.clientes)
      ? parcela.contratos.clientes[0]
      : parcela.contratos.clientes;
    if (cliente && cliente.deleted_at != null) return false;
  }
  return true;
}

/**
 * getContratosSujos
 *
 * Scans ALL open installments and returns the Set of contrato_ids that are
 * "dirty" — have at least one installment in default (≥ 15 days late).
 *
 * ⚠️ Must be called with ALL open parcelas (no date range filter) so that
 * a late installment outside the current view window still triggers the
 * contagion block on future installments.
 */
export function getContratosSujos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  todasParcelasAbertas: any[],
  todayStr: string
): Set<string> {
  const sujos = new Set<string>();
  for (const p of todasParcelasAbertas) {
    if (!isNotDeleted(p)) continue;
    const status = p.status_manual_override ?? "";

    // Already flagged as defaulted
    if (
      status === STATUS_PARCELA.INADIMPLENTE ||
      status === STATUS_PARCELA.PERDA_FATURAMENTO ||
      status === STATUS_PARCELA.POSSUI_INADIMPLENCIA ||
      status === STATUS_PARCELA.POSSUI_PERDA
    ) {
      if (p.contrato_id) sujos.add(p.contrato_id);
      continue;
    }

    // NORMAL installment — check days-late
    if (status === STATUS_PARCELA.NORMAL && p.data_vencimento) {
      const dias = calcularDiasAtraso(p.data_vencimento, todayStr);
      if (dias >= DIAS_INICIO_INADIMPLENCIA && p.contrato_id) {
        sujos.add(p.contrato_id);
      }
    }
  }
  return sujos;
}

/**
 * isParcelaValidaParaPrevisao
 *
 * ── THE ABSOLUTE FIREWALL ──
 *
 * Returns true ONLY if a parcela may appear in the cash-flow forecast.
 *
 * Gate 1: Deleted cascade (parcela / contract / client)
 * Gate 2: Terminal/non-billable status (STATUSES_PARCELA_EXCLUIDOS_PREVISAO)
 * Gate 3: Cross-default contagion — NORMAL parcela in a dirty contract
 * Gate 4: Explicit dead-debt flags (safety net)
 * Gate 5: PAGO / INADIMPLENTE_RECEBIDO → ALWAYS include (booked revenue)
 * Gate 6: Days-late check — only EM DIA and ATRASO pass
 */
export function isParcelaValidaParaPrevisao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcela: any,
  todayStr: string,
  contratosSujos?: Set<string>
): boolean {
  if (!isNotDeleted(parcela)) return false;

  const status: string = parcela.status_manual_override ?? "";

  if (STATUSES_PARCELA_EXCLUIDOS_PREVISAO.has(status)) return false;

  if (status === STATUS_PARCELA.NORMAL && contratosSujos && parcela.contrato_id) {
    if (contratosSujos.has(parcela.contrato_id)) return false;
  }

  if (
    status === STATUS_PARCELA.INADIMPLENTE ||
    status === STATUS_PARCELA.PERDA_FATURAMENTO ||
    status === STATUS_PARCELA.POSSUI_INADIMPLENCIA ||
    status === STATUS_PARCELA.POSSUI_PERDA
  )
    return false;

  if (status === STATUS_PARCELA.PAGO || status === STATUS_PARCELA.INADIMPLENTE_RECEBIDO)
    return true;

  const dias = calcularDiasAtraso(parcela.data_vencimento as string, todayStr);
  const risk = getRiskStatus(dias);
  return risk === "EM DIA" || risk === "ATRASO";
}

// ============================================================================
// SECTION 9 — CONTRACT MATH
// ============================================================================

/**
 * calcularNovoValorContrato
 *
 * Adjusts contratos.valor_total_contrato when an installment is soft-deleted
 * (EXCLUIR) or restored (RESTAURAR).
 *
 * Always uses valor_bruto (gross) — the contract tracks gross commitment.
 * @throws if either input is not a finite number
 * @returns new total, minimum 0
 */
export function calcularNovoValorContrato(
  valorAtual: number,
  valorParcela: number,
  operacao: "EXCLUIR" | "RESTAURAR"
): number {
  const atual = Number(valorAtual);
  const parcela = Number(valorParcela);
  if (!isFinite(atual) || !isFinite(parcela)) {
    throw new Error("Valores inválidos para cálculo do contrato.");
  }
  const resultado =
    operacao === "EXCLUIR"
      ? parseFloat((atual - parcela).toFixed(2))
      : parseFloat((atual + parcela).toFixed(2));
  return Math.max(0, resultado);
}

/**
 * calcularExtratoQuebraContrato
 *
 * Generates the real-time debt statement for a client in Quebra de Contrato.
 *
 * For EACH unpaid installment (in real-time from today):
 *   - diasAtraso since data_vencimento
 *   - Accumulated interest via calcularJuros()
 *   - Total per installment (valorBase + juros)
 *
 * The debt grows every 30 days indefinitely. If a lawyer opens this 2 years
 * later, the system will have calculated 24 months of interest per installment.
 *
 * @param parcelas  Unpaid installments with data_vencimento, valor_bruto/valor_previsto
 * @param todayStr  "YYYY-MM-DD"
 */
export function calcularExtratoQuebraContrato(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcelas: any[],
  todayStr: string
): {
  parcelas: Array<{
    id: string;
    numero_referencia: number;
    data_vencimento: string;
    valorBase: number;
    diasAtraso: number;
    mesesJuros: number;
    juros: number;
    totalAtualizado: number;
  }>;
  totalDivida: number;
} {
  let totalDivida = 0;
  const result = parcelas.map((p) => {
    const valorBase = Number(p.valor_bruto ?? p.valor_previsto ?? 0);
    const diasAtraso = calcularDiasAtraso(p.data_vencimento, todayStr);
    const { juros, meses: mesesJuros, totalComJuros } = calcularJuros(valorBase, diasAtraso);
    totalDivida += totalComJuros;
    return {
      id: p.id,
      numero_referencia: p.numero_referencia,
      data_vencimento: p.data_vencimento,
      valorBase,
      diasAtraso,
      mesesJuros,
      juros,
      totalAtualizado: totalComJuros,
    };
  });
  return { parcelas: result, totalDivida: parseFloat(totalDivida.toFixed(2)) };
}

// ============================================================================
// SECTION 10 — DATABASE SYNCHRONIZATION ENGINE
// ============================================================================

/**
 * syncFinanceStatuses
 *
 * THE SINGLE SOURCE OF TRUTH ENGINE.
 * Runs automatically on every page load of contas-a-receber/lista.
 *
 * ── Algorithm ──
 *  PASS 1: For each non-protected installment, compute its root status
 *          from days past due (getStatusParcelaFromDias).
 *
 *  PASS 2: Contagion forward. Once a ROOT INADIMPLENTE or PERDA is found,
 *          all subsequent open installments get the POSSUI contagion status
 *          (getContagionStatus). ATRASADO does NOT contaminate.
 *
 *  CLIENT: Escalate client status to worst found across all contracts.
 *          QUEBRA_CONTRATO / CONTRATO_ENCERRADO / CHECKOUT / INATIVO
 *          are manual — NEVER overwritten.
 *
 * ── Protected (never touched) ──
 *   PAGO | INADIMPLENTE_RECEBIDO | RENOVAR_CONTRATO | FINALIZAR_PROJETO |
 *   QUEBRA_CONTRATO | RENOVADO | CONTRATO_A_VISTA
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncFinanceStatuses(
  supabaseAdmin: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: clientes, error: fetchErr } = await supabaseAdmin
      .from("clientes")
      .select(
        `id, status_cliente,
        contratos (
          id,
          parcelas (
            id, data_vencimento, status_manual_override, deleted_at, numero_referencia
          )
        )`
      )
      .is("deleted_at", null);

    if (fetchErr) throw fetchErr;
    if (!clientes || clientes.length === 0) return { ok: true };

    const clientRank: Record<string, number> = {
      [STATUS_CLIENTE.ATIVO]: 0,
      [STATUS_CLIENTE.ATRASADO]: 1,
      [STATUS_CLIENTE.INADIMPLENTE]: 2,
      PERDA_INTERNAL: 3,
    };

    const MANUAL_CLIENT_STATUSES = new Set([
      STATUS_CLIENTE.QUEBRA_CONTRATO,
      STATUS_CLIENTE.CONTRATO_ENCERRADO,
      STATUS_CLIENTE.CHECKOUT,
      STATUS_CLIENTE.INATIVO,
    ]);

    // Statuses the sync engine can read and recompute
    const SYNCED_STATUSES = new Set([
      STATUS_PARCELA.NORMAL,
      STATUS_PARCELA.ATRASADO,
      STATUS_PARCELA.INADIMPLENTE,
      STATUS_PARCELA.PERDA_FATURAMENTO,
      STATUS_PARCELA.POSSUI_INADIMPLENCIA,
      STATUS_PARCELA.POSSUI_PERDA,
    ]);

    const parcelasUpdates: { id: string; status_manual_override: string }[] = [];
    const clientesUpdates: { id: string; status_cliente: string }[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cliente of clientes as any[]) {
      let worstClientRank = clientRank[STATUS_CLIENTE.ATIVO];
      let worstClientStatus = STATUS_CLIENTE.ATIVO;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const contrato of (cliente.contratos || []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const openParcelas = ((contrato.parcelas || []) as any[])
          .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p: any) =>
              !p.deleted_at &&
              !STATUSES_PROTEGIDOS_SYNC.has(p.status_manual_override || "")
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => {
            const d = (a.data_vencimento || "").localeCompare(b.data_vencimento || "");
            return d !== 0 ? d : (a.numero_referencia ?? 0) - (b.numero_referencia ?? 0);
          });

        // ── PASS 1: Compute root status per installment ───────────────────
        const resolvedStatuses = openParcelas.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => {
            const currentStatus = p.status_manual_override || STATUS_PARCELA.NORMAL;
            if (!SYNCED_STATUSES.has(currentStatus)) {
              return { p, newStatus: currentStatus, isRoot: false };
            }
            const dias = daysLate(p.data_vencimento, todayStr);
            if (dias <= 0) return { p, newStatus: STATUS_PARCELA.NORMAL, isRoot: false };
            const rootStatus = getStatusParcelaFromDias(dias);
            return { p, newStatus: rootStatus, isRoot: true, dias };
          }
        );

        // ── PASS 2: Propagate POSSUI contagion forward ────────────────────
        let contagionActive = false;
        let currentContagion: string | null = null;

        for (const item of resolvedStatuses) {
          if (contagionActive && currentContagion) {
            item.newStatus = currentContagion;
          } else if (item.isRoot) {
            currentContagion = getContagionStatus(item.newStatus);
            contagionActive = currentContagion !== null;
          }
        }

        // ── Determine worst client status ─────────────────────────────────
        for (const item of resolvedStatuses) {
          const ns = item.newStatus;
          let nsRank = -1;
          let nsClientStatus = STATUS_CLIENTE.ATIVO;

          if (ns === STATUS_PARCELA.PERDA_FATURAMENTO || ns === STATUS_PARCELA.POSSUI_PERDA) {
            nsRank = clientRank["PERDA_INTERNAL"];
            nsClientStatus = STATUS_CLIENTE.INADIMPLENTE; // maps to INADIMPLENTE at client level
          } else if (
            ns === STATUS_PARCELA.INADIMPLENTE ||
            ns === STATUS_PARCELA.POSSUI_INADIMPLENCIA
          ) {
            nsRank = clientRank[STATUS_CLIENTE.INADIMPLENTE];
            nsClientStatus = STATUS_CLIENTE.INADIMPLENTE;
          } else if (ns === STATUS_PARCELA.ATRASADO) {
            nsRank = clientRank[STATUS_CLIENTE.ATRASADO];
            nsClientStatus = STATUS_CLIENTE.ATRASADO;
          }

          if (nsRank > worstClientRank) {
            worstClientRank = nsRank;
            worstClientStatus = nsClientStatus;
          }
        }

        // ── Collect changed parcela rows only ─────────────────────────────
        for (const item of resolvedStatuses) {
          const oldStatus = item.p.status_manual_override || STATUS_PARCELA.NORMAL;
          if (item.newStatus !== oldStatus) {
            parcelasUpdates.push({ id: item.p.id, status_manual_override: item.newStatus });
          }
        }
      }

      // ── Collect changed client rows only ──────────────────────────────
      const currentClientStatus = cliente.status_cliente || STATUS_CLIENTE.ATIVO;
      if (
        !MANUAL_CLIENT_STATUSES.has(currentClientStatus) &&
        worstClientStatus !== currentClientStatus
      ) {
        clientesUpdates.push({ id: cliente.id, status_cliente: worstClientStatus });
      }
    }

    // ── Batch UPDATE parcelas ──────────────────────────────────────────────
    if (parcelasUpdates.length > 0) {
      console.log(`[syncFinanceStatuses] Updating ${parcelasUpdates.length} parcela(s)...`);
      await Promise.all(
        parcelasUpdates.map(({ id, status_manual_override }) =>
          supabaseAdmin
            .from("parcelas")
            .update({ status_manual_override })
            .eq("id", id)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(({ error }: { error: any }) => {
              if (error) console.error(`[syncFinanceStatuses] parcela ${id}:`, error.message);
            })
        )
      );
    }

    // ── Batch UPDATE clientes ──────────────────────────────────────────────
    if (clientesUpdates.length > 0) {
      console.log(`[syncFinanceStatuses] Updating ${clientesUpdates.length} client(s)...`);
      await Promise.all(
        clientesUpdates.map(({ id, status_cliente }) =>
          supabaseAdmin
            .from("clientes")
            .update({ status_cliente })
            .eq("id", id)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(({ error }: { error: any }) => {
              if (error) console.error(`[syncFinanceStatuses] cliente ${id}:`, error.message);
            })
        )
      );
    }

    // ── Sync pagamentos: PROCESSANDO → RECEBIDO when clearing date has passed ──
    await syncPagamentosStatus(supabaseAdmin);

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[syncFinanceStatuses] Critical failure:", msg);
    return { ok: false, error: msg };
  }
}

// ============================================================================
// SECTION 11 — PAYMENT CLEARING SYNC
// ============================================================================

/**
 * syncPagamentosStatus
 *
 * Flips pagamentos.status_pagamento from PROCESSANDO → RECEBIDO when the
 * clearing date (disponivel_em) has passed.
 *
 * Called on every Previsão page load (server-side).
 *
 * Rule: if disponivel_em <= today AND status_pagamento = 'PROCESSANDO'
 *       → update to 'RECEBIDO'
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPagamentosStatus(
  supabaseAdmin: any
): Promise<{ ok: boolean; error?: string }> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: pendentes, error } = await supabaseAdmin
      .from("pagamentos")
      .select("id")
      .eq("status_pagamento", STATUS_PAGAMENTO.PROCESSANDO)
      .lte("disponivel_em", todayStr);

    if (error) throw error;
    if (!pendentes || pendentes.length === 0) return { ok: true };

    const ids = pendentes.map((p: { id: string }) => p.id);
    await supabaseAdmin
      .from("pagamentos")
      .update({ status_pagamento: STATUS_PAGAMENTO.RECEBIDO })
      .in("id", ids);

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[syncPagamentosStatus] Failure:", msg);
    return { ok: false, error: msg };
  }
}
