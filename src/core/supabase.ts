import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";

// Polyfill global WebSocket for Node.js environments
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

const url = config.supabaseUrl || process.env.SUPABASE_URL || "https://gzmmlrzqzblykvsxnows.supabase.co";
const key = config.supabaseApiKey || process.env.SUPABASE_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6bW1scnpxemJseWt2c3hub3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNjE2ODMsImV4cCI6MjA1NTczNzY4M30.3j-QdE4z1e_1e68sPzTzL_82m2N8pZ0w";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
