import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

let supabase: SupabaseClient | null = null;

export function initSupabase(): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables"
    );
  }

  supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  return supabase;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase not initialized. Call initSupabase() first.");
  }
  return supabase;
}
