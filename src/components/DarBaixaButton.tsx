"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { registrarPagamentoCompleto } from "@/actions/parcelas";

interface DarBaixaButtonProps {
    parcelaId: string;
    valorPrevisto: number;
    isPago: boolean;
}

export default function DarBaixaButton({ parcelaId, valorPrevisto, isPago }: DarBaixaButtonProps) {
    const [isPending, startTransition] = useTransition();
    const [done, setDone] = useState(isPago);

    if (done) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400">
                <Check size={12} strokeWidth={2.5} />
                Recebido
            </span>
        );
    }

    function handleClick() {
        // Default quick-pay: today's date via ISO string, platform PIX
        const today = new Date().toISOString().split("T")[0];
        startTransition(async () => {
            const res = await registrarPagamentoCompleto(
                parcelaId,
                valorPrevisto,
                today,
                "PIX"
            );
            if (res.ok) setDone(true);
            else console.error("[DarBaixaButton]", res.error);
        });
    }

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 hover:border-green-500/40 text-green-400 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isPending ? (
                <Loader2 size={12} className="animate-spin" />
            ) : (
                <Check size={12} strokeWidth={2.5} />
            )}
            {isPending ? "Salvando..." : "Dar Baixa"}
        </button>
    );
}
