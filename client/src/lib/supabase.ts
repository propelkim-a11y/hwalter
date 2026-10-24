// =============================================================
// 활터 있소 - Supabase 연동 설정
// =============================================================

import { createClient } from "@supabase/supabase-js";

// ★★★ Supabase 프로젝트 정보 ★★★
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const isSupabaseConfigured = true;
