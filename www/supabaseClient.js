// ==================== SUPABASE CLIENT CONFIG ====================
// The Anon Key is safe to expose client-side because Supabase uses Row Level
// Security (RLS) policies at the database level to authorize requests. Even if
// someone extracts this key, they can only access data they are permitted to see.
// =================================================================

const SUPABASE_URL = 'https://uwtyjzhlipidqxibtsqo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FRpJWPni9WYBKYVTIve_zQ_UJnOFbIF';

if (typeof supabase === 'undefined' && typeof window.supabase === 'undefined') {
  console.warn("Supabase CDN library was not loaded yet. Make sure to load the CDN script first.");
}

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
window.supabaseClient = supabaseClient;
