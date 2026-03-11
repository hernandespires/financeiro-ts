"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback } from "react";
import { Search, X } from "lucide-react";

interface OperacoesToolbarProps {
    agencias: string[];      // distinct list from current data
    categorias: string[];
    // current active filter values
    status: string;
    agencia: string;
    categoria: string;
    search: string;
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

    return (
        <div className="flex flex-col border-b border-white/[0.05]">
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
