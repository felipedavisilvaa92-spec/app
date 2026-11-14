import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = createClient(url || "https://missing.supabase.co", anonKey || "missing-anon-key");
