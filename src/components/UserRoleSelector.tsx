'use client';

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { atualizarCargoUsuario } from "@/actions/usuarios";

const CARGOS = [
    { value: 'ADMIN', label: 'T.I / Admin' },
    { value: 'DIRETOR', label: 'Diretor' },
    { value: 'FINANCEIRO', label: 'Financeiro Pleno' },
    { value: 'AUXILIAR', label: 'Auxiliar / Operacional' },
];

export default function UserRoleSelector({ userId, currentRole }: { userId: string; currentRole: string }) {
    const [isPending, startTransition] = useTransition();
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const novoCargo = e.target.value;
        setStatus('idle');
        startTransition(async () => {
            const res = await atualizarCargoUsuario(userId, novoCargo);
            if (res.error) {
                setStatus('error');
            } else {
                setStatus('success');
                setTimeout(() => setStatus('idle'), 2000);
            }
        });
    }

    const isPrivileged = currentRole === 'ADMIN' || currentRole === 'DIRETOR';

    return (
        <div className="flex items-center justify-end gap-3">
            {isPending && <Loader2 size={14} className="animate-spin text-orange-500" />}
            {status === 'success' && (
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest animate-in fade-in">Salvo ✓</span>
            )}
            {status === 'error' && (
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest animate-in fade-in">Erro</span>
            )}

            <select
                defaultValue={currentRole}
                onChange={handleChange}
                disabled={isPending}
                className={`bg-black/40 border rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-widest focus:outline-none focus:border-orange-500 transition-colors cursor-pointer appearance-none text-center disabled:opacity-60 ${isPrivileged
                        ? 'border-orange-500/50 text-orange-400'
                        : 'border-white/10 text-gray-300'
                    }`}
            >
                {CARGOS.map(c => (
                    <option key={c.value} value={c.value} className="bg-black text-white">
                        {c.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
