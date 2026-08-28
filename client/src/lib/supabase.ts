// =============================================================
// 활터 있소 - Supabase 연동 설정
// =============================================================

import { createClient } from "@supabase/supabase-js";

// ★★★ Supabase 프로젝트 정보 ★★★
export const SUPABASE_URL = "https://hcatwwprdavonekfgbzx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjYXR3d3ByZGF2b25la2ZnYnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjI4NzEsImV4cCI6MjA5NjM5ODg3MX0.F2ClJGQJubszt871pH9bEeoYTfnfm8Ag6MS4xFGzB3U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const isSupabaseConfigured = true;
