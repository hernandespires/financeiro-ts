'use server'

import { supabaseAdmin } from '../lib/supabase';
import { calcularDataDisponibilidade } from '../lib/financeRules';
import { requireAuth } from '../lib/authGuard';

export type TipoCadastro = 'RECORRENTE' | 'A_VISTA' | 'PONTUAL' | 'ANTIGO';

export interface DadosCadastroCompleto {
    tipo_cadastro: TipoCadastro;
    nome: string;
    empresa: string;
    telefone: string;
    cidade: string;
    estado: string;
    pais: string;
    segmento: string;
    aniversario: string;
    link_asana: string;
    agencia: string;
    sdr: string;
    closer: string;
    cnpj_vinculado: string;
    programa_fechado?: string;
    forma_pagamento: string;
    periodicidade?: string;
    data_inicio: string;
    valor_parcela_bruto: number;
    periodo_meses: number;
    porcentagem_imposto: number;
    categoria_faturamento: string;
    parcelas_com_valor?: number;
    parcela_atual?: number;
    parcela1_data?: string;
    parcela2_data?: string;
    parcela2_valor?: number;
}

export async function cadastrarClienteCompleto(dados: DadosCadastroCompleto) {
    let clienteCriadoNestaSessaoId: string | null = null;

    try {
        await requireAuth();
        console.log(`Iniciando cadastro [${dados.tipo_cadastro}]:`, dados.nome);

        // --- 2. BUSCANDO OS IDs RELACIONAIS ---
        const { data: agencia } = await supabaseAdmin.from('dim_agencias').select('id').eq('nome', dados.agencia).single();
        const { data: sdr } = await supabaseAdmin.from('dim_equipe').select('id').eq('nome', dados.sdr).single();
        const { data: closer } = await supabaseAdmin.from('dim_equipe').select('id').eq('nome', dados.closer).single();

        let programaId = null;
        if (dados.programa_fechado && dados.programa_fechado.trim() !== '') {
            const { data: programa } = await supabaseAdmin.from('dim_programas').select('id').eq('nome', dados.programa_fechado).maybeSingle();
            if (programa) programaId = programa.id;
        }

        // --- 3. INSERE O CLIENTE ---
        const novoCliente = {
            nome_cliente: dados.nome,
            empresa_label: dados.empresa,
            telefone: dados.telefone || null,
            cidade: dados.cidade || null,
            estado: dados.estado || null,
            pais: dados.pais || 'Estados Unidos',
            segmento: dados.segmento || null,
            aniversario: dados.aniversario ? new Date(dados.aniversario).toISOString() : null,
            link_asana: dados.link_asana || null,
            status_cliente: 'ATIVO',
        };

        const { data: clienteInserido, error: erroCliente } = await supabaseAdmin
            .from('clientes')
            .insert(novoCliente)
            .select('id')
            .single();

        if (erroCliente) throw new Error(`Erro ao criar cliente: ${erroCliente.message}`);
        clienteCriadoNestaSessaoId = clienteInserido.id;

        // --- TRATAMENTO DE PERIODICIDADE E PARCELAS (AGORA BLINDADO) ---
        let periodicidadeFinal = (dados.periodicidade || 'MENSAL').toUpperCase();
        let quantidadeComValor = 1;

        if (dados.tipo_cadastro === 'A_VISTA') {
            // Força a conversão para número e garante que seja no mínimo 1
            quantidadeComValor = Number(dados.parcelas_com_valor);
            if (isNaN(quantidadeComValor) || quantidadeComValor < 1) {
                quantidadeComValor = 1;
            }
            if (quantidadeComValor === 1) periodicidadeFinal = 'MENSAL';
        }

        let multiplicador = 1;
        if (periodicidadeFinal === 'SEMANAL') multiplicador = 4;
        if (periodicidadeFinal === 'QUINZENAL') multiplicador = 2;

        // No "À Vista", o período de meses pode vir vazio, então assumimos 1 mês como mínimo seguro.
        const mesesSeguros = Number(dados.periodo_meses) > 0 ? Number(dados.periodo_meses) : 1;

        let quantidade_parcelas_total = mesesSeguros * multiplicador;

        if (dados.tipo_cadastro === 'A_VISTA') {
            // For A_VISTA, parcelas_total = mesesSeguros (contract duration)
            // so the renewal marker fires at the right time, not based on billing splits
            quantidade_parcelas_total = mesesSeguros;
        }

        // ── Gross & Net per parcela (NO division — user inputs per-parcela bruto directly) ──────
        const valor_bruto_parcela = Number(dados.valor_parcela_bruto);
        const imposto = Number(dados.porcentagem_imposto) || 0;
        const valor_liquido_parcela = Number((valor_bruto_parcela * (1 - (imposto / 100))).toFixed(2));

        // For A_VISTA 2x: total = sum of both explicit brutoes
        // For A_VISTA 1x: total = just the one bruto
        // For others: total = bruto × quantidade_parcelas_total
        let valor_total_contrato: number;
        if (dados.tipo_cadastro === 'A_VISTA' && quantidadeComValor === 2 && dados.parcela2_valor) {
            valor_total_contrato = Number((valor_bruto_parcela + Number(dados.parcela2_valor)).toFixed(2));
        } else if (dados.tipo_cadastro === 'A_VISTA') {
            valor_total_contrato = valor_bruto_parcela;
        } else {
            valor_total_contrato = Number((valor_bruto_parcela * quantidade_parcelas_total).toFixed(2));
        }

        // --- 4. INSERE O CONTRATO ---
        let tipoContratoEnum = 'RECORRENTE';
        if (dados.tipo_cadastro === 'A_VISTA') tipoContratoEnum = 'À VISTA';
        if (dados.tipo_cadastro === 'PONTUAL') tipoContratoEnum = 'PONTUAL';
        if (dados.tipo_cadastro === 'ANTIGO') tipoContratoEnum = 'RECORRENTE';

        const novoContrato = {
            cliente_id: clienteInserido.id,
            agencia_id: agencia?.id || null,
            sdr_id: sdr?.id || null,
            closer_id: closer?.id || null,
            programa_id: programaId,
            tipo_contrato: tipoContratoEnum,
            periodicidade: periodicidadeFinal,
            data_inicio: dados.data_inicio,
            valor_total_contrato: valor_total_contrato,
            valor_base_parcela: valor_bruto_parcela,
            parcelas_total: quantidade_parcelas_total,
            imposto_percentual: imposto,
            cnpj_vinculado: dados.cnpj_vinculado,
            forma_pagamento: dados.forma_pagamento
        };

        const { data: contrato, error: erroContrato } = await supabaseAdmin
            .from('contratos')
            .insert(novoContrato)
            .select('id')
            .single();

        if (erroContrato) throw new Error(`Erro ao criar contrato: ${erroContrato.message}`);

        // --- 5. GERA AS PARCELAS ---
        const parcelasParaInserir = [];
        let dataVenc = new Date(`${dados.data_inicio}T12:00:00Z`);

        if (dados.tipo_cadastro === 'A_VISTA') {
            // ── Explicit push — no loop ───────────────────────────────────────────────────────

            // Parcela 1 — always present
            // Use explicit parcela1_data if provided (2x split), else fall back to data_inicio
            const p1_data_venc = dados.parcela1_data || dados.data_inicio;
            parcelasParaInserir.push({
                contrato_id: contrato.id,
                numero_referencia: 1,
                sub_indice: 0,
                data_vencimento: p1_data_venc,
                valor_bruto: valor_bruto_parcela,
                valor_previsto: valor_liquido_parcela,
                tipo_parcela: 'CONTRATO',
                categoria: 'NOVOS CLIENTES',
                status_manual_override: 'NORMAL',
                observacao: quantidadeComValor === 2 ? 'Pagamento 1/2 (À Vista)' : 'Pagamento à Vista',
                data_disponibilidade_prevista: calcularDataDisponibilidade(p1_data_venc, dados.forma_pagamento),
            });

            // Parcela 2 — only when 2x split
            if (quantidadeComValor === 2 && dados.parcela2_data && dados.parcela2_valor) {
                const p2_bruto = Number(dados.parcela2_valor);
                const p2_liquido = Number((p2_bruto * (1 - (imposto / 100))).toFixed(2));

                parcelasParaInserir.push({
                    contrato_id: contrato.id,
                    numero_referencia: 2,
                    sub_indice: 0,
                    data_vencimento: dados.parcela2_data,
                    valor_bruto: p2_bruto,
                    valor_previsto: p2_liquido,
                    tipo_parcela: 'CONTRATO',
                    categoria: 'À VISTA',
                    status_manual_override: 'NORMAL',
                    observacao: 'Pagamento 2/2 (À Vista)',
                    data_disponibilidade_prevista: calcularDataDisponibilidade(dados.parcela2_data, dados.forma_pagamento),
                });
            }

            // A_VISTA renewal marker is now added universally below

        } else {
            // LÓGICA UNIVERSAL (RECORRENTE, PONTUAL E ANTIGO) -> HISTÓRICO COMPLETO

            for (let i = 1; i <= quantidade_parcelas_total; i++) {
                let valor = valor_bruto_parcela;
                let statusManual = 'NORMAL';

                // Respeita a Categoria do Front, mas aplica inteligência se for BASE
                let categoriaDefinida = dados.categoria_faturamento ? dados.categoria_faturamento.toUpperCase() : 'BASE';

                if (categoriaDefinida === 'BASE' || categoriaDefinida === 'NOVOS CLIENTES') {
                    categoriaDefinida = (i === 1) ? 'NOVOS CLIENTES' : 'BASE';
                }

                if (dados.tipo_cadastro === 'PONTUAL') {
                    if (i === quantidade_parcelas_total) statusManual = 'FINALIZAR PROJETO';
                }

                parcelasParaInserir.push({
                    contrato_id: contrato.id,
                    numero_referencia: i,
                    sub_indice: 0,
                    data_vencimento: dataVenc.toISOString().split('T')[0],
                    valor_bruto: valor_bruto_parcela,
                    valor_previsto: valor_liquido_parcela,
                    tipo_parcela: 'CONTRATO',
                    categoria: categoriaDefinida,
                    status_manual_override: statusManual,
                    observacao: `Gerado via Dashboard (${dados.tipo_cadastro})`,
                    data_disponibilidade_prevista: calcularDataDisponibilidade(
                        dataVenc.toISOString().split('T')[0],
                        dados.forma_pagamento
                    ),
                });

                if (periodicidadeFinal === 'SEMANAL') dataVenc.setDate(dataVenc.getDate() + 7);
                else if (periodicidadeFinal === 'QUINZENAL') dataVenc.setDate(dataVenc.getDate() + 15);
                else dataVenc.setMonth(dataVenc.getMonth() + 1);
            }
        }

        // ── Universal "Despertador" (Renewal marker) ─────────────────────────────
        // Appended for ALL contract types so every contract has a renewal/end signal.
        const dataFimContrato = new Date(`${dados.data_inicio}T12:00:00Z`);
        dataFimContrato.setMonth(dataFimContrato.getMonth() + mesesSeguros);

        parcelasParaInserir.push({
            contrato_id: contrato.id,
            numero_referencia: parcelasParaInserir.length + 1,
            sub_indice: 0,
            data_vencimento: dataFimContrato.toISOString().split('T')[0],
            valor_bruto: 0,
            valor_previsto: 0,
            tipo_parcela: 'ADICIONAL',
            categoria: 'RENOVAÇÕES',
            status_manual_override: 'RENOVAR CONTRATO',
            observacao: 'Término do contrato',
        });

        const { error: erroParcelas } = await supabaseAdmin
            .from('parcelas')
            .insert(parcelasParaInserir);

        if (erroParcelas) throw new Error(`Erro ao gerar parcelas: ${erroParcelas.message}`);

        return {
            sucesso: true,
            mensagem: `Sucesso! Foram criadas ${parcelasParaInserir.length} faturas/avisos no sistema.`
        };

    } catch (error: any) {
        console.error("ERRO:", error.message);

        // ROLLBACK
        if (clienteCriadoNestaSessaoId) {
            await supabaseAdmin.from('clientes').delete().eq('id', clienteCriadoNestaSessaoId);
        }

        return { sucesso: false, erro: error.message };
    }
}