import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 1. Cliente Padrão (Frontend)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Cliente VIP (Backend)
// Se a chave não existir, o Next.js vai gritar um erro bem claro agora!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);