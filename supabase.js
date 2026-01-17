// 1) Supabase projekt: Project Settings -> API
// 2) Ide másold be az URL-t és az anon public key-t.
// Megjegyzés: a demo működéshez a legegyszerűbb RLS-t kikapcsolni (README-ben leírom),
// vagy használd a mellékelt policy-kat.

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});
