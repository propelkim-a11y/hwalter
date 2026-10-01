import { SUPABASE_URL } from "@/lib/supabase";

const SUPPORT_IMAGE_BUCKET = "support-images";
const SUPPORT_IMAGE_PATH_PREFIX = `/storage/v1/object/public/${SUPPORT_IMAGE_BUCKET}/public/`;

/** 기타 안내에서 앱이 업로드한 공개 JPEG 이미지만 허용한다. */
export function safeSupportImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const supabaseUrl = new URL(SUPABASE_URL);
    const isAllowedPath = url.pathname.startsWith(SUPPORT_IMAGE_PATH_PREFIX) && url.pathname.toLowerCase().endsWith(".jpg");
    return url.protocol === "https:" && url.origin === supabaseUrl.origin && isAllowedPath ? url.href : null;
  } catch {
    return null;
  }
}
