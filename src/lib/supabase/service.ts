// CHỈ DÙNG SERVER — KHÔNG import vào client component
// Dùng khi cần bypass RLS (job hệ thống). Phải tự kiểm tra session + role thủ công.
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
