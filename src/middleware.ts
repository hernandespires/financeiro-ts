import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return request.cookies.getAll() },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const isLoginPage = request.nextUrl.pathname.startsWith('/login')
    const isAuthCallback = request.nextUrl.pathname.startsWith('/auth')
    const isBloqueadoPage = request.nextUrl.pathname.startsWith('/bloqueado')

    // ── Unauthenticated: block all protected routes ───────────────────────────
    if (!user && !isLoginPage && !isAuthCallback && !isBloqueadoPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // ── Authenticated: strict cargo (role) check ──────────────────────────────
    if (user) {
        const { data: userData } = await supabase
            .from('usuarios')
            .select('cargo')
            .eq('id', user.id)
            .maybeSingle()

        const hasRole = !!userData?.cargo

        // No role yet → waiting room (allow /bloqueado and /auth/* to pass through)
        if (!hasRole && !isBloqueadoPage && !isAuthCallback) {
            const url = request.nextUrl.clone()
            url.pathname = '/bloqueado'
            return NextResponse.redirect(url)
        }

        // Has role → prevent access to /login or /bloqueado
        if (hasRole && (isLoginPage || isBloqueadoPage)) {
            const url = request.nextUrl.clone()
            url.pathname = '/'
            return NextResponse.redirect(url)
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        // Protege todas as rotas, exceto arquivos estáticos e imagens
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
