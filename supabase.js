// 1) Supabase projekt: Project Settings -> API
// 2) Ide másold be az URL-t és az anon public key-t.
// Megjegyzés: a demo működéshez a legegyszerűbb RLS-t kikapcsolni (README-ben leírom),
// vagy használd a mellékelt policy-kat.

const SUPABASE_URL = "https://tisfsoerdufcbusslymn.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_U8iceA_u25OjEaWjHkeGAw_XD99-Id-";

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});
