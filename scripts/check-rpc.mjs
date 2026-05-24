import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: process.env.PUBLIC_USER_EMAIL, password: process.env.PUBLIC_USER_PASSWORD });
const t0 = Date.now();
const { data, error } = await sb.rpc('server_now_ms');
const t1 = Date.now();
if (error) { console.log('server_now_ms ERROR:', error.message, '(SQL likely NOT run)'); }
else { console.log('server_now_ms OK ->', data, '| rtt', t1-t0, 'ms | local-vs-server skew ~', (Date.now()-Number(data)), 'ms'); }
