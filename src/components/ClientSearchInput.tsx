"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useCallback } from "react";

export default function ClientSearchInput() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentQ = searchParams.get("q") ?? "";

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value) {
                params.set("q", e.target.value);
            } else {
                params.delete("q");
            }
            router.replace(`/consultar-clientes?${params.toString()}`);
        },
        [router, searchParams]
    );

    return (
        <div className="relative flex-1 max-w-sm">
            <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
                type="text"
                defaultValue={currentQ}
                onChange={handleChange}
                placeholder="Buscar por nome ou empresa..."
                className="w-full rounded-xl bg-black/40 backdrop-blur-md border border-white/10 pl-9 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
        </div>
    );
}
