'use client';

import { useState, useTransition } from "react";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { adicionarComentario } from "@/actions/comentarios";

export default function CommentForm({ clienteId }: { clienteId: string }) {
    const [text, setText] = useState("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSend() {
        if (!text.trim()) return;
        setErrorMsg(null);
        startTransition(async () => {
            const res = await adicionarComentario(clienteId, text);
            if (res.error) {
                setErrorMsg(res.error);
            } else {
                setText("");
            }
        });
    }

    return (
        <div className="flex flex-col mt-4">
            <div className="flex items-start gap-2 bg-white/[0.02] backdrop-blur-xl p-2 rounded-xl border border-white/10 shadow-lg">
                <textarea
                    value={text}
                    onChange={(e) => { setText(e.target.value); setErrorMsg(null); }}
                    placeholder="Adicione um comentário, observação ou motivo de cancelamento..."
                    className="w-full bg-transparent text-sm text-white placeholder-gray-500 resize-none h-14 p-2 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <button
                    onClick={handleSend}
                    disabled={isPending || !text.trim()}
                    className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500 hover:bg-orange-400 text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 mt-2 shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                >
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.5} />}
                </button>
            </div>

            {/* Error Display */}
            {errorMsg && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <span className="text-xs font-medium text-red-400">{errorMsg}</span>
                </div>
            )}
        </div>
    );
}
