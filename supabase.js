// 1) Supabase projekt: Project Settings -> API
// 2) Ide masold be az URL-t es az anon public key-t.
//
// FONTOS: ha nem irod at ezeket, NEM fog mukodni a szoba letrehozas.

window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";

window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});
