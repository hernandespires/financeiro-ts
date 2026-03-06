'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // 1. Check actively on mount (fixes infinite loading if event fired too early)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                router.push('/');
            }
        };
        checkSession();

        // 2. Listen for the event as a fallback
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                router.push('/');
            }
        });

        // 3. Safety kick-out: nothing in URL → back to login
        const hash = window.location.hash;
        const search = window.location.search;
        if (!hash && !search.includes('code=')) {
            router.push('/login');
        }

        return () => subscription.unsubscribe();
    }, [router]);

    // Fundo escuro simples para transição invisível e suave
    return <div className="fixed inset-0 bg-[#050505] z-[9999]" />;
}
