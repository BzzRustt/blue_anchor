-- M5: attendee access rework. The badge QR stops being a login. ADDITIVE ONLY.
-- New attendee preference columns, a one-time claim marker for spare walk-up tags,
-- personal access tokens (hashed) and an organiser audit log.
-- Restore point to take first: a Neon branch (restore-pre-m5-...). Apply with scripts/apply-migration.mjs.
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'full' CHECK (profile_visibility IN ('hidden','name','full'));
--> statement-breakpoint
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS allow_messages boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS access_claimed_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS attendee_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL CHECK (created_by IN ('organiser','email')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS attendee_access_tokens_attendee_idx ON attendee_access_tokens(attendee_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_event_idx ON audit_log(event_id, created_at DESC);
