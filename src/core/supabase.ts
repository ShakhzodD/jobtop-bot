import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";

export const supabase = createClient(
  config.supabaseUrl || "https://placeholder.supabase.co",
  config.supabaseApiKey || "placeholder-key",
  {
    auth: { persistSession: false },
  }
);
