import { createClient } from '@supabase/supabase-js'

// Returns a loosely-typed client (no Database generic) because hand-authored
// Database types have index-signature compatibility issues with newer versions of
// @supabase/supabase-js. Run `supabase gen types typescript` against a live
// project to replace types/database.ts with a properly generated file.
// Use the exported row interfaces (Profile, Scan, Response) to type query results.
export function createAdminClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
