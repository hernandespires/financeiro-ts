'use client';

import { useState, useTransition } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { restaurarParcela } from '@/actions/parcelas';

interface Props { parcelaId: string; }

export default function RestaurarParcelaButton({ parcelaId }: Props) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleRestore() {
        setError(null);
        startTransition(async () => {
            const res = await restaurarParcela(parcelaId);
            if (!res.ok) setError(res.error ?? 'Erro ao restaurar.');
        });
    }

    return (
        <div className="flex flex-col items-center gap-1">
            <button
                onClick={handleRestore}
                disabled={isPending}
                title="Restaurar parcela excluída"
                className="inline-flex items-center gap-1 rounded-lg border border-green-500/30 hover:border-green-500 bg-green-500/5 hover:bg-green-500/10 text-green-400 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all disabled:opacity-50"
            >
                {isPending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                {isPending ? 'Restaurando…' : '♻ Restaurar'}
            </button>
            {error && <p className="text-[9px] text-red-400 max-w-[80px] text-center">{error}</p>}
        </div>
    );
}
