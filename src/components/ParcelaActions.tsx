"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, GitBranch, CreditCard, Scissors, Pencil, Trash2, AlertTriangle, RefreshCw, XCircle, Split, Eye, UploadCloud, Download, FileText } from "lucide-react";
import { registrarPagamentoCompleto, desmembrarParcela, editarParcela, softDeleteParcela, getParcelaDetails } from "@/actions/parcelas";
import { renovarContrato } from "@/actions/renovacao";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ParcelaForActions {
    id: string;
    valor_previsto: number;
    valor_bruto?: number | null;
    imposto_percentual?: number | null;
    status_manual_override: string;
    numero_referencia?: number;
    sub_indice?: number | null;
    forma_pagamento_contrato?: string;
    observacao?: string | null;
    data_vencimento?: string;
    hasPagamento?: boolean;
    contrato_id?: string | null;
    cliente_id?: string | null;
}

interface ParcelaActionsProps {
    parcela: ParcelaForActions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const todayISO = () => new Date().toISOString().split("T")[0];

// ─── Shared Input styles ──────────────────────────────────────────────────────
const inputCls =
    "w-full rounded-xl bg-white/[0.02] backdrop-blur-xl border border-white/15 shadow-2xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors";

const labelCls = "text-[11px] font-semibold text-gray-400 uppercase tracking-widest";

// ─── Error message helper ─────────────────────────────────────────────────────
function ErrorMsg({ msg }: { msg: string | null }) {
    if (!msg) return null;
    return (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {msg}
        </p>
    );
}

// ─── Payment Modal — Drag & Drop + Simplified Math ────────────────────────────
function PaymentModal({
    parcela,
    onClose,
    onSuccess,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const brutoOriginal = parcela.valor_bruto ?? parcela.valor_previsto ?? 0;

    let initialJuros = 0;
    if (parcela.data_vencimento) {
        const todayStr = new Date().toISOString().split("T")[0];
        if (todayStr > parcela.data_vencimento) {
            const t1 = new Date(parcela.data_vencimento).getTime();
            const t2 = new Date(todayStr).getTime();
            const daysLate = Math.floor((t2 - t1) / (1000 * 3600 * 24));
            if (daysLate >= 10) {
                const mesesAtraso = Math.ceil(daysLate / 30);
                initialJuros = brutoOriginal * 0.015 * mesesAtraso;
            }
        }
    }

    const [jurosCalculado] = useState(initialJuros);
    const [cobrarJuros, setCobrarJuros] = useState(false);

    const baseBruto = brutoOriginal;
    const expectedBruto = cobrarJuros && jurosCalculado > 0 ? baseBruto + jurosCalculado : baseBruto;

    const [valorPlataforma, setValorPlataforma] = useState(expectedBruto.toFixed(2));
    const [dataPagamento, setDataPagamento] = useState(todayISO());
    const [plataforma, setPlataforma] = useState(parcela.forma_pagamento_contrato || 'PIX');
    const [observacao, setObservacao] = useState(parcela.observacao || '');

    useEffect(() => {
        setValorPlataforma(expectedBruto.toFixed(2));
    }, [expectedBruto]);
    
    // Drag & Drop state
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    const [isPending, startTransition] = useTransition();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const numPlataforma = parseFloat(valorPlataforma) || 0;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
    };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    };

    function handleSalvar() {
        setError(null);
        if (numPlataforma <= 0) { setError('Informe o valor recebido.'); return; }
        
        startTransition(async () => {
            setIsUploading(true);
            let anexoUrl: string | undefined = undefined;

            if (file) {
                try {
                    const { createClient } = await import('@supabase/supabase-js');
                    const supabase = createClient(
                        process.env.NEXT_PUBLIC_SUPABASE_URL!,
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                    );
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${parcela.id}_${Date.now()}.${fileExt}`;
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('comprovantes')
                        .upload(fileName, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: publicUrlData } = supabase.storage
                        .from('comprovantes')
                        .getPublicUrl(uploadData?.path || fileName);

                    anexoUrl = publicUrlData.publicUrl;
                } catch (err: any) {
                    console.error("Upload error:", err);
                    setError("Erro ao fazer upload do comprovante.");
                    setIsUploading(false);
                    return;
                }
            }

            // --- NEW FINANCIAL MATH CALCULATIONS ---
            const impostoPerc = parcela.imposto_percentual ?? 0;
            const taxaPlataforma = Math.max(0, expectedBruto - numPlataforma);
            const impostoRetido = numPlataforma * (impostoPerc / 100);
            const valorLiquidoReal = numPlataforma - impostoRetido;

            const res = await registrarPagamentoCompleto(
                parcela.id,
                numPlataforma, 
                taxaPlataforma, 
                impostoRetido, 
                valorLiquidoReal,
                cobrarJuros ? jurosCalculado : 0, 
                dataPagamento,
                plataforma,
                observacao || undefined,
                anexoUrl,
                cobrarJuros ? expectedBruto : undefined
            );
            
            setIsUploading(false);
            if (res.ok) { onSuccess(); onClose(); }
            else setError(res.error ?? 'Erro desconhecido.');
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Registrar Pagamento"
            subtitle={`Valor previsto: ${brl(parcela.valor_previsto)}`}
            icon={<CreditCard size={18} className="text-green-400" />}
        >
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Plataforma</label>
                        <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}
                            className={inputCls + " cursor-pointer"}>
                            {["STRIPE BRASIL", "STRIPE EUA", "IUGU", "LOJA", "PIX", "APP DE TRANSFERÊNCIA", "DINHEIRO"].map(p => (
                                <option key={p} value={p} className="bg-[#111] text-white">{p}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Data do Pagamento</label>
                        <input type="date" value={dataPagamento}
                            onChange={(e) => setDataPagamento(e.target.value)} className={inputCls} />
                    </div>
                </div>

                {jurosCalculado > 0 && (
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 max-w-full">
                        <div className="flex items-center gap-2 text-[#FF3B30]">
                            <AlertTriangle size={16} />
                            <span className="text-sm font-semibold">
                                Esta parcela está atrasada. Juros acumulado: {brl(jurosCalculado)}
                            </span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input 
                                type="checkbox" 
                                checked={cobrarJuros}
                                onChange={(e) => setCobrarJuros(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-black/50 text-[#ffa300] focus:ring-[#ffa300]/30"
                            />
                            <span className="text-xs text-gray-300">Cobrar e adicionar juros ao valor bruto da parcela?</span>
                        </label>
                    </div>
                )}

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Valor Recebido (Líquido)</label>
                    <input type="number" min="0.01" step="0.01" value={valorPlataforma}
                        onChange={(e) => setValorPlataforma(e.target.value)}
                        placeholder={expectedBruto.toFixed(2)}
                        className={`${inputCls} text-green-400 font-bold text-base`}
                        autoFocus />
                </div>

                {/* Drag and Drop Zone */}
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Comprovante (Opcional)</label>
                    <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all ${
                            isDragging ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                    >
                        <input 
                            type="file" 
                            accept="image/*,.pdf" 
                            onChange={handleFileChange} 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {file ? (
                            <div className="flex flex-col items-center gap-1 text-center px-4">
                                <Check size={20} className="text-green-400" />
                                <span className="text-xs font-medium text-white truncate max-w-[200px]">{file.name}</span>
                                <span className="text-[10px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1 text-center">
                                <UploadCloud size={20} className="text-gray-400 mb-1" />
                                <span className="text-xs font-medium text-gray-300">Arraste um PDF ou Imagem</span>
                                <span className="text-[10px] text-gray-500">ou clique para selecionar</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Observações (Opcional)</label>
                    <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Pagamento recebido via app..."
                        className={inputCls + " resize-none h-16"} />
                </div>

                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end items-center mt-2">
                <Button variant="outline" onClick={onClose} disabled={isPending || isUploading}>Cancelar</Button>
                <Button variant="success" onClick={handleSalvar} isLoading={isPending || isUploading} icon={<Check size={14} strokeWidth={2.5} />}>
                    {isUploading ? 'Anexando...' : isPending ? 'Salvando…' : `Confirmar Baixa`}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Ficha da Parcela Modal (Deep Dive) ───────────────────────────────────────
function ParcelaDetailsModal({
    parcelaId,
    onClose,
}: {
    parcelaId: string;
    onClose: () => void;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);

    useEffect(() => {
        getParcelaDetails(parcelaId).then(res => {
            if (res.ok) setData(res.data);
            else setError(res.error ?? "Erro ao carregar detalhes.");
            setLoading(false);
        });
    }, [parcelaId]);

    if (loading) return (
        <Modal onClose={onClose} title="Ficha da Parcela" subtitle="Carregando dados estruturais..." icon={<Eye size={18} className="text-blue-400" />}>
            <div className="h-40 flex items-center justify-center"><RefreshCw size={24} className="animate-spin text-gray-600" /></div>
        </Modal>
    );

    if (error || !data) return (
        <Modal onClose={onClose} title="Ficha da Parcela" icon={<AlertTriangle size={18} className="text-red-400" />}>
            <ErrorMsg msg={error || "Dados não encontrados."} />
        </Modal>
    );

    const ct = data.contratos || {};
    const cl = ct.clientes || {};
    const pag = Array.isArray(data.pagamentos) ? data.pagamentos[0] : (data.pagamentos || null);
    
    const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const anexoUrl = pag?.anexo_url;
    const isPdf = anexoUrl?.toLowerCase().endsWith('.pdf');

    // ── Read status directly from DB (no shadow-state calculations) ────────────────
    const parcelStatus: string = data.status_manual_override || 'NORMAL';
    const isPago = parcelStatus === 'PAGO' || parcelStatus === 'INADIMPLENTE RECEBIDO';
    // "Dead debt" statuses: no prediction, no interest — they are DB-confirmed
    const isDeadDebt = [
        'INADIMPLENTE', 'PERDA DE FATURAMENTO',
        'EM_INADIMPLENCIA', 'EM_PERDA_FATURAMENTO',
    ].includes(parcelStatus);

    // Days late (for juros calculation only — not for status override)
    const todayStr = new Date().toISOString().split("T")[0];
    const vencimentoStr = data.data_vencimento || "";
    let daysLate = 0;
    if (vencimentoStr && todayStr > vencimentoStr) {
        const t1 = new Date(vencimentoStr).getTime();
        const t2 = new Date(todayStr).getTime();
        daysLate = Math.floor((t2 - t1) / (1000 * 3600 * 24));
    }

    // Juros — use stored value if exists, otherwise estimate
    let jurosCalculado = data.juros_aplicado || 0;
    if (!jurosCalculado && daysLate >= 10 && !isPago) {
        const mesesAtraso = Math.ceil(daysLate / 30) || 1;
        jurosCalculado = (data.valor_bruto || data.valor_previsto || 0) * 0.015 * mesesAtraso;
    }

    // ── Disponibilidade prediction (strict business rules) ────────────────────
    let txPlatform = (ct.forma_pagamento || '').toUpperCase();
    if (pag?.plataforma) txPlatform = pag.plataforma.toUpperCase();

    let disponivelText = "\u2014";
    if (pag && pag.disponivel_em) {
        // PAID: show the actual recorded date
        disponivelText = pag.disponivel_em.split('-').reverse().join('/');
    } else if (!isPago && !isDeadDebt && vencimentoStr) {
        // UNPAID + healthy (NORMAL/ATRASADO): estimate by platform
        const refDate = new Date(vencimentoStr + 'T12:00:00');
        if (txPlatform.includes('STRIPE')) {
            refDate.setDate(refDate.getDate() + 5);
        } else if (txPlatform.includes('IUGU')) {
            let bizDays = 0;
            while (bizDays < 3) {
                refDate.setDate(refDate.getDate() + 1);
                const dow = refDate.getDay();
                if (dow !== 0 && dow !== 6) bizDays++;
            }
        }
        // PIX = same day (no offset)
        const iso = refDate.toISOString().split('T')[0];
        disponivelText = `~ ${iso.split('-').reverse().join('/')}`;
    }
    // Dead debts and pre-payment rows keep the default "—"

    const SectionTitle = ({ label, color }: { label: string, color: string }) => (
        <h3 className={`text-[10px] font-bold ${color} uppercase tracking-widest pl-1 mt-2 mb-1`}>{label}</h3>
    );

    const InfoBox = ({ label, value, highlight, link }: { label: string, value: string, highlight?: string, link?: string }) => (
        <div className="flex flex-col p-3 rounded-xl bg-black border border-white/5">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
            {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className={`text-base font-medium break-words ${highlight || 'text-white hover:underline'}`}>{value}</a>
            ) : (
                <span className={`text-base font-medium break-words ${highlight || 'text-white'}`}>{value}</span>
            )}
        </div>
    );

    return (
        <Modal onClose={onClose} title="Ficha da Parcela" subtitle={`Raio-X Completo da Fatura #${data.numero_referencia}`} icon={<Eye size={18} className="text-blue-400" />} maxWidth="5xl">
            <div className="flex flex-col gap-4 w-full pb-2 overflow-y-auto max-h-[75vh] pr-2 custom-scrollbar">
                
                {/* 1. SECTION: DOSSIÊ DO CLIENTE */}
                <div className="flex flex-col gap-1.5 bg-[#1C1C1E] p-4 rounded-2xl border border-white/5">
                    <SectionTitle label="1. Dossiê do Cliente" color="text-gray-400" />
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-1">
                        <InfoBox label="Nome" value={cl.nome_cliente || 'N/A'} highlight="text-white" />
                        <InfoBox label="Empresa" value={cl.empresa_label || cl.nome_cliente || 'N/A'} />
                        <div className="flex flex-col p-3 rounded-xl bg-black border border-white/5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</span>
                            <div className="mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider ${
                                    cl.status_cliente === 'INADIMPLENTE' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 
                                    cl.status_cliente === 'ATIVO' ? 'bg-[#34C759]/10 text-[#34C759]' : 
                                    'bg-white/10 text-gray-300'
                                }`}>{cl.status_cliente || 'N/A'}</span>
                            </div>
                        </div>
                        <InfoBox label="Categoria" value={data.categoria || 'N/A'} />
                        <InfoBox label="Agência" value={ct.dim_agencias?.nome || '—'} />
                        <InfoBox label="Board Asana" value={cl.link_asana ? "Abrir Link" : "—"} link={cl.link_asana} highlight={cl.link_asana ? "text-blue-400" : "text-gray-500"} />
                    </div>
                </div>

                {/* 2. SECTION: RAIO-X DA PARCELA */}
                <div className="flex flex-col gap-1.5 bg-[#1C1C1E] p-4 rounded-2xl border border-white/5">
                    <SectionTitle label="2. Raio-X da Parcela" color="text-[#ffa300]" />
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-1">
                        <InfoBox label="Parcela" value={`${data.numero_referencia}${data.sub_indice ? `-${data.sub_indice}` : ''} / ${ct.parcelas_total || data.numero_referencia}`} />
                        <InfoBox label="Vencimento" value={vencimentoStr ? vencimentoStr.split('-').reverse().join('/') : '—'} />
                        <div className="flex flex-col p-3 rounded-xl bg-black border border-white/5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Status Op.</span>
                            <div className="mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider ${
                                    isPago ? 'bg-[#34C759]/10 text-[#34C759]' :                            isDeadDebt || parcelStatus === 'ATRASADO' ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 
                                    'bg-[#ffa300]/10 text-[#ffa300]'
                                }`}>{parcelStatus}</span>
                            </div>
                        </div>
                        <InfoBox label="Atraso (Dias)" value={daysLate > 0 && !isPago ? `${daysLate} dias` : '—'} highlight={daysLate > 0 && !isPago ? "text-[#FF3B30]" : "text-gray-500"} />
                        <InfoBox label="Forma Pagamento" value={ct.forma_pagamento || '—'} />
                        <InfoBox label="Observação" value={data.observacao || '—'} highlight={data.observacao ? "text-gray-300 whitespace-pre-wrap max-h-20 overflow-y-auto" : "text-gray-500"} />
                        {/* 1 */} <InfoBox label="Plano / Contrato" value={ct.tipo_contrato || '—'} />
                        {/* 2 */} <InfoBox label="Fração da Parcela" value={data.numero_referencia && ct.parcelas_total ? `${data.numero_referencia} / ${ct.parcelas_total}` : '—'} />
                        {/* 3 */} <InfoBox label="Ticket Mensal (Base)" value={brl(ct.valor_base_parcela)} />
                        {/* 4 */} <InfoBox label="Valor Total (Contrato)" value={brl(ct.valor_total_contrato)} highlight="text-orange-400 font-mono font-bold" />
                    </div>
                </div>

                {/* 3. SECTION: AUDITORIA FINANCEIRA */}
                <div className="flex flex-col gap-1.5 bg-[#1C1C1E] p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between">
                        <SectionTitle label="3. Auditoria Financeira" color="text-[#34C759]" />
                        <span className="text-xs font-semibold text-gray-500 bg-white/5 px-2 py-0.5 rounded-lg">FLUXO DO DINHEIRO</span>
                    </div>
                    
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-1">
                        {/* 1 */} <InfoBox label="Valor Bruto" value={fmtNum(data.valor_bruto || data.valor_previsto)} highlight="text-white font-mono" />
                        {/* 2 */} <InfoBox label="Previsto Líquido" value={fmtNum(data.valor_previsto)} highlight="text-[#ffa300] font-mono font-bold" />
                        {/* 3 */} <InfoBox label="Valor Pago Plataforma" value={pag ? fmtNum(pag.valor_pago) : "—"} highlight={pag ? "text-white font-mono" : "text-gray-500 font-mono"} />
                        {/* 4 */} <InfoBox label="Plataforma Recebimento" value={pag ? pag.plataforma : "—"} />
                        {/* 5 */} <InfoBox label={`% Imposto NF (${ct.imposto_percentual || 0}%)`} value={pag ? fmtNum(pag.imposto_retido) : "—"} highlight="text-rose-400 font-mono" />
                        
                        {/* 6 */} <InfoBox label="Taxa Plataforma" value={pag ? fmtNum(pag.taxa_gateway) : "—"} highlight="text-rose-400 font-mono" />
                        {/* 7 */} <InfoBox label="Juros Aplicado" value={fmtNum(jurosCalculado)} highlight={jurosCalculado > 0 ? "text-[#FF3B30] font-mono" : "text-gray-500 font-mono"} />
                        {/* 8 */} <InfoBox label="Líquido Real Na Conta" value={pag && pag.valor_liquido_real !== undefined ? fmtNum(pag.valor_liquido_real) : "—"} highlight={pag ? "text-[#34C759] font-mono font-bold" : "text-gray-500 font-mono"} />
                        {/* 9 */} <InfoBox label="Data Pagamento" value={pag && pag.data_pagamento ? pag.data_pagamento.split('-').reverse().join('/') : "—"} />
                        {/* 10 */} <InfoBox label="Disponível Em" value={disponivelText} />
                    </div>
                </div>

                {/* 4. SECTION: ANEXO */}
                <div className="flex flex-col gap-1.5 bg-[#1C1C1E] p-4 rounded-2xl border border-white/5">
                    <SectionTitle label="4. COMPROVANTE (ANEXO)" color="text-blue-400" />
                    {anexoUrl ? (
                        <>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-400">Arquivo recebido e anexado.</span>
                                <a href={anexoUrl} target="_blank" download rel="noopener noreferrer" className="text-[10px] font-semibold text-gray-400 hover:text-white flex items-center gap-1 transition-colors bg-black px-3 py-1.5 rounded-lg border border-white/10">
                                    <Download size={10} /> Download / Abrir em nova guia
                                </a>
                            </div>
                            
                            {isPdf ? (
                                <iframe src={`${anexoUrl}#toolbar=0`} className="w-full h-96 rounded-lg bg-white border border-white/10 mt-2" />
                            ) : (
                                <img src={anexoUrl} alt="Comprovante" 
                                     className="w-full max-h-[600px] object-contain rounded-lg border border-white/10 mt-2" 
                                     onError={(e) => {
                                        const t = e.currentTarget;
                                        t.style.display = 'none';
                                        if (!t.dataset.errorDisplayed) {
                                            t.dataset.errorDisplayed = "true";
                                            t.insertAdjacentHTML('afterend', '<p class="text-sm text-red-400 mt-2">Falha ao carregar a imagem. Verifique se o arquivo existe e o bucket é público.</p>');
                                        }
                                     }} />
                            )}
                        </>
                    ) : (
                        <div className="mt-2 p-4 rounded-xl bg-black border border-white/5 text-center">
                            <span className="text-gray-500 text-sm">Nenhum comprovante anexado.</span>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex justify-end pt-4 border-t border-white/5">
                <Button variant="outline" onClick={onClose}>Fechar Ficha</Button>
            </div>
        </Modal>
    );
}

// ─── Split Modal ──────────────────────────────────────────────────────────────
function SplitModal({
    parcela,
    onClose,
    onSuccess,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [novoValor, setNovoValor] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const novoValorNum = parseFloat(novoValor) || 0;
    const saldo = parseFloat((parcela.valor_previsto - novoValorNum).toFixed(2));
    const saldoValido = saldo > 0 && novoValorNum > 0 && novoValorNum < parcela.valor_previsto;

    function handleDividir() {
        setError(null);
        if (!saldoValido) { setError("O novo valor deve ser maior que zero e menor que o valor original."); return; }
        startTransition(async () => {
            const res = await desmembrarParcela(parcela.id, novoValorNum);
            if (res.ok) { onSuccess(); onClose(); }
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Desmembrar Parcela"
            subtitle={`Valor original: ${brl(parcela.valor_previsto)}`}
            icon={<Scissors size={18} className="text-orange-400" />}
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo valor desta parcela (R$)</label>
                    <input type="number" min="0.01" step="0.01" max={parcela.valor_previsto - 0.01}
                        value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
                        placeholder={`Máx. ${brl(parcela.valor_previsto - 0.01)}`}
                        className={inputCls} autoFocus />
                </div>

                {/* Live preview */}
                <div className={`rounded-xl border p-3 text-xs leading-relaxed transition-all ${saldoValido
                    ? "bg-orange-500/5 border-orange-500/20 text-orange-300"
                    : "bg-white/3 border-white/5 text-gray-600"}`}>
                    {saldoValido ? (
                        <>
                            ✂️ Esta parcela ficará com <strong className="text-white">{brl(novoValorNum)}</strong>
                            <br />
                            Uma nova parcela será criada com o saldo restante de{" "}
                            <strong className="text-orange-400">{brl(saldo)}</strong>
                        </>
                    ) : (
                        "Informe um valor para visualizar o desmembramento."
                    )}
                </div>

                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="primary" onClick={handleDividir} isLoading={isPending}
                    disabled={isPending || !saldoValido}
                    icon={<GitBranch size={14} strokeWidth={2} />}>
                    {isPending ? "Dividindo…" : "Dividir"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Edit Parcela Modal ───────────────────────────────────────────────────────
function EditParcelaModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [valor, setValor] = useState(parcela.valor_previsto.toFixed(2));
    const [dataVenc, setDataVenc] = useState(parcela.data_vencimento ?? todayISO());
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleSalvar() {
        setError(null);
        const val = parseFloat(valor);
        if (isNaN(val) || val <= 0) { setError("Informe um valor válido."); return; }
        if (!dataVenc) { setError("Informe a data de vencimento."); return; }
        startTransition(async () => {
            const res = await editarParcela(parcela.id, val, dataVenc);
            if (res.ok) onClose();
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Editar Parcela"
            subtitle="Reajuste valor ou data de vencimento"
            icon={<Pencil size={16} className="text-blue-400" />}
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Novo Valor (R$)</label>
                    <input type="number" min="0.01" step="0.01" value={valor}
                        onChange={(e) => setValor(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Nova Data de Vencimento</label>
                    <input type="date" value={dataVenc}
                        onChange={(e) => setDataVenc(e.target.value)} className={inputCls} />
                </div>
                <ErrorMsg msg={error} />
            </div>

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="info" onClick={handleSalvar} isLoading={isPending} icon={<Check size={14} strokeWidth={2.5} />}>
                    {isPending ? "Salvando…" : "Salvar"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Delete Parcela Modal ─────────────────────────────────────────────────────
function DeleteParcelaModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const ref = parcela.sub_indice
        ? `${parcela.numero_referencia}-${parcela.sub_indice}`
        : `${parcela.numero_referencia}`;

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const res = await softDeleteParcela(parcela.id);
            if (res.ok) onClose();
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title={`Excluir Parcela #${ref}`}
            subtitle="Esta ação pode ser revertida pelo admin"
            icon={<AlertTriangle size={16} className="text-red-400" />}
        >
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    A parcela de <strong className="text-white">{brl(parcela.valor_previsto)}</strong> será
                    marcada como excluída logicamente e removida da listagem.
                </p>
            </div>

            <ErrorMsg msg={error} />

            <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                <Button variant="danger" onClick={handleConfirmar} isLoading={isPending} icon={<Trash2 size={14} />}>
                    {isPending ? "Excluindo…" : "Confirmar"}
                </Button>
            </div>
        </Modal>
    );
}

// ─── Não Renovar Modal ────────────────────────────────────────────────────────
function NaoRenovarModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    function handleConfirmar() {
        setError(null);
        startTransition(async () => {
            const { editarParcelaStatus } = await import("@/actions/parcelas");
            const res = await editarParcelaStatus(parcela.id, "FINALIZAR PROJETO");
            if (res.ok) setDone(true);
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Não Renovar Contrato"
            subtitle="Esta ação é permanente e registra o churn."
            icon={<XCircle size={18} className="text-red-400" />}
        >
            {done ? (
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 text-center">
                    <p className="text-sm text-red-300 font-semibold">✔ Contrato finalizado. Sem renovação.</p>
                </div>
            ) : (
                <>
                    <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                        <p className="text-sm text-gray-300 leading-relaxed">
                            O status desta parcela será alterado para{" "}
                            <strong className="text-red-400">FINALIZAR PROJETO</strong>, sinalizando o churn
                            definitivo deste cliente. Esta ação pode ser revertida pelo admin.
                        </p>
                    </div>
                    <ErrorMsg msg={error} />
                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                        <Button variant="danger" onClick={handleConfirmar} isLoading={isPending} icon={<XCircle size={14} />}>
                            {isPending ? "Finalizando…" : "Confirmar Churn"}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Renovar Modal ────────────────────────────────────────────────────────────
function RenovarModal({
    parcela,
    onClose,
}: {
    parcela: ParcelaForActions;
    onClose: () => void;
}) {
    const [periodo, setPeriodo] = useState("12");
    const [valorTotal, setValorTotal] = useState("");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const valorNum = parseFloat(valorTotal) || 0;
    const periodoNum = Number(periodo);
    const isValid = valorNum > 0 && periodoNum >= 1;

    function handleRenovar() {
        setError(null);
        if (!parcela.contrato_id || !parcela.cliente_id) {
            setError("Dados do contrato insuficientes. Recarregue a página.");
            return;
        }
        startTransition(async () => {
            const res = await renovarContrato({
                parcelaRenovacaoId: parcela.id,
                contratoAntigoId: parcela.contrato_id!,
                clienteId: parcela.cliente_id!,
                novo_periodo_meses: periodoNum,
                novo_valor_total: valorNum,
            });
            if (res.ok) setDone(true);
            else setError(res.error ?? "Erro desconhecido.");
        });
    }

    return (
        <Modal
            onClose={onClose}
            title="Renovar Contrato"
            subtitle="Defina o período e valor da renovação"
            icon={<RefreshCw size={18} className="text-green-400" />}
        >
            {done ? (
                <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4 text-center">
                    <p className="text-sm text-green-300 font-semibold">✔ Contrato renovado com sucesso! As novas parcelas foram geradas.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Novo Período (meses)</label>
                            <input type="number" min="1" max="60" step="1" value={periodo}
                                onChange={(e) => setPeriodo(e.target.value)} className={inputCls} />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Novo Valor Total (R$)</label>
                            <input type="number" min="0.01" step="0.01" value={valorTotal}
                                onChange={(e) => setValorTotal(e.target.value)}
                                placeholder="Ex: 12000.00" className={inputCls} />
                        </div>

                        <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3 text-xs text-green-300 leading-relaxed">
                            📅 Serão geradas <strong className="text-white">{periodo} novas parcelas</strong> com valor
                            de <strong className="text-white">
                                {valorNum > 0 && periodoNum > 0 ? brl(valorNum / periodoNum) : "R$ —"}
                            </strong> cada.
                        </div>

                        {error && <ErrorMsg msg={error} />}
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                        <Button variant="success" onClick={handleRenovar} isLoading={isPending}
                            disabled={isPending || !isValid}
                            icon={<RefreshCw size={14} />}>
                            {isPending ? "Processando…" : "Renovar"}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────
export default function ParcelaActions({ parcela }: ParcelaActionsProps) {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isSplitOpen, setIsSplitOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isRenewOpen, setIsRenewOpen] = useState(false);
    const [isNotRenewOpen, setIsNotRenewOpen] = useState(false);
    const [localPago, setLocalPago] = useState(
        parcela.status_manual_override === "PAGO" ||
        parcela.status_manual_override === "INADIMPLENTE RECEBIDO"
    );
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const s = parcela.status_manual_override;
    const isPago = localPago;

    // ── Action availability groups ──────────────────────────────────────────
    // FULL actions: NORMAL + ATRASADO (still collectible)
    const isFullActionable = s === "NORMAL" || s === "ATRASADO";
    // PARTIAL actions: in-default statuses can still receive payment
    const isPartialActionable = s === "EM_INADIMPLENCIA" || s === "EM_PERDA_FATURAMENTO";
    // VIEW ONLY: terminal dead-debt statuses
    const isViewOnly = s === "INADIMPLENTE" || s === "PERDA DE FATURAMENTO";

    // Edit/Delete only available for NORMAL installments with no payment
    const showEditDelete = s === "NORMAL" && !parcela.hasPagamento;
    // Only root installments (not sub_indice) can be split
    const showSplit = s === "NORMAL" && (parcela.sub_indice === null || parcela.sub_indice === undefined || parcela.sub_indice === 0);

    // ── Shared modals fragment ──────────────────────────────────────────────
    const AllModals = (
        <>
            {mounted && isDetailsOpen && (
                <ParcelaDetailsModal parcelaId={parcela.id} onClose={() => setIsDetailsOpen(false)} />
            )}
            {mounted && isPaymentOpen && (
                <PaymentModal
                    parcela={parcela}
                    onClose={() => setIsPaymentOpen(false)}
                    onSuccess={() => setLocalPago(true)}
                />
            )}
            {mounted && isSplitOpen && (
                <SplitModal parcela={parcela} onClose={() => setIsSplitOpen(false)} onSuccess={() => setIsSplitOpen(false)} />
            )}
            {mounted && isEditOpen && (
                <EditParcelaModal parcela={parcela} onClose={() => setIsEditOpen(false)} />
            )}
            {mounted && isDeleteOpen && (
                <DeleteParcelaModal parcela={parcela} onClose={() => setIsDeleteOpen(false)} />
            )}
        </>
    );

    // ── 1. ALREADY PAID ─────────────────────────────────────────────────────
    if (isPago) {
        return (
            <div className="flex flex-row items-center justify-end gap-1.5 w-full">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#34C759]/70 h-6 px-2.5">
                    <Check size={11} strokeWidth={2.5} />
                    Recebido
                </span>
                <button
                    onClick={() => setIsDetailsOpen(true)}
                    title="Ver Ficha da Parcela"
                    className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400 transition-all"
                >
                    <Eye size={11} strokeWidth={2} />
                </button>
                {mounted && isDetailsOpen && (
                    <ParcelaDetailsModal parcelaId={parcela.id} onClose={() => setIsDetailsOpen(false)} />
                )}
            </div>
        );
    }

    // ── 2. RENOVAR CONTRATO ─────────────────────────────────────────────────
    if (s === "RENOVAR CONTRATO") {
        const todayStr = new Date().toISOString().split("T")[0];
        const isLiberado = todayStr >= (parcela.data_vencimento || "2099-01-01");
        return (
            <>
                <div className="flex flex-row items-center justify-end gap-1.5">
                    <button
                        onClick={() => setIsRenewOpen(true)}
                        disabled={!isLiberado}
                        title={!isLiberado ? "Aguarde a data de término do contrato" : "Processar renovação"}
                        className="h-6 px-2.5 text-[10px] font-bold uppercase tracking-widest rounded-md bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/20 hover:bg-[#34C759]/20 hover:border-[#34C759]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Renovar
                    </button>
                    <button
                        onClick={() => setIsNotRenewOpen(true)}
                        disabled={!isLiberado}
                        title={!isLiberado ? "Aguarde a data de término do contrato" : "Registrar cancelamento/fim"}
                        className="h-6 px-2.5 text-[10px] font-bold uppercase tracking-widest rounded-md bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20 hover:bg-[#FF3B30]/20 hover:border-[#FF3B30]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        Não Renovar
                    </button>
                </div>
                {mounted && isRenewOpen && (
                    <RenovarModal parcela={parcela} onClose={() => setIsRenewOpen(false)} />
                )}
                {mounted && isNotRenewOpen && (
                    <NaoRenovarModal parcela={parcela} onClose={() => setIsNotRenewOpen(false)} />
                )}
            </>
        );
    }

    // ── 3. VIEW-ONLY: terminal dead-debt statuses (INADIMPLENTE / PERDA DE FATURAMENTO) ──
    if (isViewOnly) {
        return (
            <div className="flex flex-row items-center justify-end gap-1.5 w-full">
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
                    s === "PERDA DE FATURAMENTO"
                        ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20"
                        : "bg-[#FF453A]/10 text-[#FF453A]"
                }`}>
                    {s === "PERDA DE FATURAMENTO" ? "Perda" : "Inadimplente"}
                </span>
                <button
                    onClick={() => setIsDetailsOpen(true)}
                    title="Ver Ficha da Parcela"
                    className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400 transition-all"
                >
                    <Eye size={11} strokeWidth={2} />
                </button>
                {mounted && isDetailsOpen && (
                    <ParcelaDetailsModal parcelaId={parcela.id} onClose={() => setIsDetailsOpen(false)} />
                )}
            </div>
        );
    }

    // ── 4. PARTIAL actions: EM_INADIMPLENCIA / EM_PERDA_FATURAMENTO ─────────
    //    These are DB-synced states. Collection is still possible → show Baixa + Eye.
    if (isPartialActionable) {
        return (
            <>
                <div className="flex flex-row items-center justify-end gap-1.5 w-full">
                    {/* Dar Baixa */}
                    <button
                        onClick={() => setIsPaymentOpen(true)}
                        title="Registrar pagamento (cobrança em atraso)"
                        className="inline-flex items-center justify-center h-6 px-2.5 gap-1 rounded-md bg-[#FF9500]/10 border border-[#FF9500]/20 hover:bg-[#FF9500]/20 hover:border-[#FF9500]/40 text-[#FF9500] text-[10px] font-semibold transition-all whitespace-nowrap"
                    >
                        <Check size={11} strokeWidth={2.5} />
                        Baixa
                    </button>
                    {/* Ficha */}
                    <button
                        onClick={() => setIsDetailsOpen(true)}
                        title="Ver Ficha da Parcela"
                        className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400 transition-all"
                    >
                        <Eye size={11} strokeWidth={2} />
                    </button>
                </div>
                {mounted && isPaymentOpen && (
                    <PaymentModal
                        parcela={parcela}
                        onClose={() => setIsPaymentOpen(false)}
                        onSuccess={() => setLocalPago(true)}
                    />
                )}
                {mounted && isDetailsOpen && (
                    <ParcelaDetailsModal parcelaId={parcela.id} onClose={() => setIsDetailsOpen(false)} />
                )}
            </>
        );
    }

    // ── 5. FULL actions: NORMAL + ATRASADO ──────────────────────────────────
    return (
        <>
            <div className="flex flex-row items-center justify-end gap-1.5 w-full">
                {/* Dar Baixa */}
                <button
                    onClick={() => setIsPaymentOpen(true)}
                    title="Registrar pagamento"
                    className="inline-flex items-center justify-center h-6 px-2.5 gap-1 rounded-md bg-[#34C759]/10 border border-[#34C759]/10 hover:bg-[#34C759]/20 hover:border-[#34C759]/30 text-[#34C759] text-[10px] font-semibold transition-all whitespace-nowrap"
                >
                    <Check size={11} strokeWidth={2.5} />
                    Baixa
                </button>

                {/* Info / Eye Details */}
                <button
                    onClick={() => setIsDetailsOpen(true)}
                    title="Ver Ficha da Parcela"
                    className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400 transition-all"
                >
                    <Eye size={11} strokeWidth={2} />
                </button>

                {/* Dividir (split) */}
                {showSplit && (
                    <button
                        onClick={() => setIsSplitOpen(true)}
                        title="Desmembrar parcela"
                        className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-blue-500/10 border border-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400 transition-all"
                    >
                        <Split size={11} strokeWidth={2.5} />
                    </button>
                )}

                {/* Editar */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsEditOpen(true)}
                        title="Editar parcela"
                        className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 text-gray-300 transition-all"
                    >
                        <Pencil size={11} strokeWidth={2.5} />
                    </button>
                )}

                {/* Deletar */}
                {showEditDelete && (
                    <button
                        onClick={() => setIsDeleteOpen(true)}
                        title="Excluir parcela"
                        className="inline-flex items-center justify-center h-6 px-2.5 rounded-md bg-[#FF3B30]/10 border border-[#FF3B30]/10 hover:bg-[#FF3B30]/20 hover:border-[#FF3B30]/30 text-[#FF3B30] transition-all"
                    >
                        <Trash2 size={11} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {AllModals}
        </>
    );
}
