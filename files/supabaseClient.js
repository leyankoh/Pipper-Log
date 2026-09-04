import { createClient } from "@supabase/supabase-js";

// These come from Vercel's environment variables at build time (see README).
// Never hardcode your Supabase URL/key directly if this repo is public —
// env vars keep them out of git history (though note: the anon key is
// still visible in the shipped JS bundle, same as any client-side app).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

const KEYS = {
  bookings: "bookings-data",
  instructions: "instructions-data",
};

// Same shape as the old window.storage helpers, so the rest of the app
// (calendar logic, care instructions, etc.) doesn't need to change at all —
// only these two functions had to learn to talk to Supabase instead.
export async function storageGet(key) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value; // jsonb column — Supabase already parses this to an object
}

export async function storageSet(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  return !error;
}

export { KEYS };
