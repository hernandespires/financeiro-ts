'use server'

import { supabaseAdmin } from '../lib/supabase';

export type TipoCadastro = 'RECORRENTE' | 'A_VISTA' | 'PONTUAL' | 'ANTIGO';

export interface DadosCadastroCompleto {
    tipo_cadastro: TipoCadastro;
    nome: string;
    empresa: string;
    cnpj: string;
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
    valor_total: number;
    periodo_meses: number;
    porcentagem_imposto: number;
    categoria_faturamento: string;
    parcelas_com_valor?: number;
    parcela_atual?: number; // Obsoleto, mantido só para a interface não quebrar se o front mandar
}

export async function cadastrarClienteCompleto(dados: DadosCadastroCompleto) {
    let clienteCriadoNestaSessaoId: string | null = null;

    try {
        console.log(`Iniciando cadastro [${dados.tipo_cadastro}]:`, dados.nome);

        // --- 1. VERIFICA CNPJ DUPLICADO ---
        const { data: clienteExistente } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .eq('cnpj_contrato', dados.cnpj)
            .maybeSingle();

        if (clienteExistente) {
            throw new Error(`Este CNPJ / EIN (${dados.cnpj}) já está cadastrado no sistema.`);
        }

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
            cnpj_contrato: dados.cnpj,
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

        // --- TRATAMENTO DE PERIODICIDADE E PARCELAS ---
        let periodicidadeFinal = (dados.periodicidade || 'MENSAL').toUpperCase();
        let quantidadeComValor = 1;

        if (dados.tipo_cadastro === 'A_VISTA') {
            quantidadeComValor = (dados.parcelas_com_valor && dados.parcelas_com_valor > 0) ? dados.parcelas_com_valor : 1;
            if (quantidadeComValor === 1) periodicidadeFinal = 'MENSAL';
        }

        let multiplicador = 1;
        if (periodicidadeFinal === 'SEMANAL') multiplicador = 4;
        if (periodicidadeFinal === 'QUINZENAL') multiplicador = 2;

        const quantidade_parcelas_total = dados.periodo_meses * multiplicador;

        let divisor = quantidade_parcelas_total || 1;
        if (dados.tipo_cadastro === 'A_VISTA') divisor = quantidadeComValor;

        const valor_parcela_calculado = Number((dados.valor_total / divisor).toFixed(2));

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
            valor_total_contrato: dados.valor_total,
            valor_base_parcela: valor_parcela_calculado,
            parcelas_total: quantidade_parcelas_total,
            imposto_percentual: dados.porcentagem_imposto || 0,
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
            // LÓGICA DO À VISTA INTELIGENTE
            for (let i = 1; i <= quantidadeComValor; i++) {
                parcelasParaInserir.push({
                    contrato_id: contrato.id,
                    numero_referencia: i,
                    sub_indice: 0,
                    data_vencimento: dataVenc.toISOString().split('T')[0],
                    valor_previsto: valor_parcela_calculado,
                    tipo_parcela: 'CONTRATO',
                    categoria: i === 1 ? 'NOVOS CLIENTES' : 'À VISTA',
                    status_manual_override: 'NORMAL',
                    observacao: `Pagamento ${i}/${quantidadeComValor} (À Vista)`
                });

                if (periodicidadeFinal === 'SEMANAL') dataVenc.setDate(dataVenc.getDate() + 7);
                else if (periodicidadeFinal === 'QUINZENAL') dataVenc.setDate(dataVenc.getDate() + 15);
                else dataVenc.setMonth(dataVenc.getMonth() + 1);
            }

            // Parcela "Despertador" pro fim do contrato
            const dataFimContrato = new Date(`${dados.data_inicio}T12:00:00Z`);
            dataFimContrato.setMonth(dataFimContrato.getMonth() + dados.periodo_meses);

            parcelasParaInserir.push({
                contrato_id: contrato.id,
                numero_referencia: quantidadeComValor + 1,
                sub_indice: 0,
                data_vencimento: dataFimContrato.toISOString().split('T')[0],
                valor_previsto: 0, // Zero Reais
                tipo_parcela: 'ADICIONAL',
                categoria: 'À VISTA',
                status_manual_override: 'RENOVAR CONTRATO',
                observacao: `Término do contrato de ${dados.periodo_meses} meses`
            });

        } else {
            // LÓGICA UNIVERSAL (RECORRENTE, PONTUAL E ANTIGO) -> HISTÓRICO COMPLETO

            for (let i = 1; i <= quantidade_parcelas_total; i++) {
                let valor = valor_parcela_calculado;
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
                    valor_previsto: valor,
                    tipo_parcela: 'CONTRATO', // Todos são CONTRATO agora, pois é o histórico completo
                    categoria: categoriaDefinida,
                    status_manual_override: statusManual,
                    observacao: `Gerado via Dashboard (${dados.tipo_cadastro})`
                });

                if (periodicidadeFinal === 'SEMANAL') dataVenc.setDate(dataVenc.getDate() + 7);
                else if (periodicidadeFinal === 'QUINZENAL') dataVenc.setDate(dataVenc.getDate() + 15);
                else dataVenc.setMonth(dataVenc.getMonth() + 1);
            }
        }

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