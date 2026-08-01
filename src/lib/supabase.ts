/**
 * Lazy Supabase client singleton.
 *
 * The client is constructed on FIRST CALL, never at module scope — env-less
 * dev machines must boot with `getConfig()`'s clear failure message, not a
 * hang against an `undefined/rest/v1` URL (The120 env-less-build learning).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Tokens arrive via The120's login route in a POST JSON body and are
        // adopted with setSession(); they are never present in the URL.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
