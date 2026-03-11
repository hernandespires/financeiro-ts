"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface OperacoesToolbarProps {
    agencias: string[];      // distinct list from current data
    categorias: string[];
    // current active filter values
    status: string;
    agencia: string;
    categoria: string;
    search: string;
    currentMonth: string;
    monthLabelCap: string;
    year: number;
}

const sel =
    "rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-[11px] px-2.5 py-1.5 focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark] cursor-pointer min-w-[9rem]";

const STATUS_OPTIONS = [
    { value: "", label: "Todos os status" },
    { value: "a_receber", label: "A Receber" },
    { value: "vence_hoje", label: "Vence Hoje" },
    { value: "atrasados", label: "Atrasados" },
    { value: "inadimplentes", label: "Inadimplentes" },
    { value: "pagos", label: "Pagos" },
];

export default function OperacoesToolbar({
    agencias,
    categorias,
    status,
    agencia,
    categoria,
    search,
    currentMonth,
    monthLabelCap,
    year,
}: OperacoesToolbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();
    const [, startTransition] = useTransition();

    const push = useCallback(
        (updates: Record<string, string>) => {
            const params = new URLSearchParams(sp.toString());
            for (const [k, v] of Object.entries(updates)) {
                if (v) params.set(k, v);
                else params.delete(k);
            }
            startTransition(() => router.push(`${pathname}?${params.toString()}`));
        },
        [sp, pathname, router]
    );

    const [y, mo] = currentMonth.split("-").map(Number);
    const prevDate = new Date(y, mo - 2, 1);
    const prevMonthUrlStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const nextDate = new Date(y, mo, 1);
    const nextMonthUrlStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

    return (
        <div className="flex flex-col border-b border-white/[0.05]">
            {/* Header Navegação Apple Style (Moved inside Toolbar) */}
            <div className="flex flex-col items-center justify-center pt-8 pb-6 border-b border-white/[0.05] bg-white/[0.01]">
                {/* Tabs */}
                <div className="flex bg-[#111] border border-white/5 rounded-full p-1 mb-6">
                    <button className="px-5 py-1.5 text-[11px] font-semibold rounded-full bg-white/10 text-white shadow-sm transition-all focus:outline-none">Mensal</button>
                    <button onClick={() => router.push(`/contas-a-receber/previsao?period=annual&date=${year}-01`)} className="px-5 py-1.5 text-[11px] font-medium rounded-full text-gray-500 hover:text-white transition-all focus:outline-none">Anual</button>
                </div>
                {/* Date Navigator com Picker nativo */}
                <div className="flex items-center gap-6 relative">
                    <button onClick={() => push({ month: prevMonthUrlStr })} className="text-gray-500 hover:text-orange-500 transition-colors focus:outline-none"><ChevronLeft size={24} strokeWidth={1.5} /></button>
                    
                    <label className="relative cursor-pointer group flex items-center justify-center min-w-[16rem]">
                        <h1 className="text-3xl font-medium text-white tracking-tight text-center group-hover:text-orange-400 transition-colors">
                            {monthLabelCap}
                        </h1>
                        <input 
                            type="month" 
                            className="absolute opacity-0 inset-0 cursor-pointer w-full h-full"
                            value={currentMonth}
                            onChange={(e) => {
                                if (e.target.value) push({ month: e.target.value });
                            }}
                        />
                    </label>

                    <button onClick={() => push({ month: nextMonthUrlStr })} className="text-gray-500 hover:text-orange-500 transition-colors focus:outline-none"><ChevronRight size={24} strokeWidth={1.5} /></button>
                </div>
            </div>

            <div className="flex flex-col gap-3 px-6 py-4 bg-white/[0.02]">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <select
                    value={status}
                    onChange={(e) => push({ status: e.target.value })}
                    className={sel}
                >
                    {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>

                {/* Agência */}
                <select
                    value={agencia}
                    onChange={(e) => push({ agencia: e.target.value })}
                    className={sel}
                >
                    <option value="">Todas as agências</option>
                    {agencias.map((a) => (
                        <option key={a} value={a}>{a}</option>
                    ))}
                </select>

                {/* Categoria */}
                <select
                    value={categoria}
                    onChange={(e) => push({ categoria: e.target.value })}
                    className={sel}
                >
                    <option value="">Todas as categorias</option>
                    {categorias.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>

                {/* Search */}
                <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Buscar cliente ou empresa..."
                        defaultValue={search}
                        onKeyDown={(e) => {
                            if (e.key === "Enter")
                                push({ search: (e.target as HTMLInputElement).value });
                        }}
                        className="rounded-lg bg-white/[0.04] border border-white/10 text-gray-300 text-[11px] pl-7 pr-7 py-1.5 focus:outline-none focus:border-orange-500 transition-colors w-56 placeholder-gray-600"
                    />
                    {search && (
                        <button
                            onClick={() => push({ search: "" })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                            <X size={11} />
                        </button>
                    )}
                </div>
                </div>
            </div>
        </div>
    );
}
