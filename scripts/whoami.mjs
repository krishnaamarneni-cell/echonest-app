import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: s, error } = await sb.auth.signInWithPassword({ email: process.env.PUBLIC_USER_EMAIL, password: process.env.PUBLIC_USER_PASSWORD });
if (error) { console.log('SIGNIN ERROR:', error.message); process.exit(1); }
console.log('email:', process.env.PUBLIC_USER_EMAIL);
console.log('uid  :', s.user.id);
console.log('created_at:', s.user.created_at);
