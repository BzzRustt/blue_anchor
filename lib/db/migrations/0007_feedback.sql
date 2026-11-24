-- 2026-11-24 demo feedback. ADDITIVE ONLY: the live (older) code keeps working against this.
-- Personal blocks: by browser token (lasting) with the network hash as a 24-hour backstop.
ALTER TABLE blocked_devices ADD COLUMN IF NOT EXISTS session_token text;
--> statement-breakpoint
ALTER TABLE blocked_devices ALTER COLUMN device_hash DROP NOT NULL;
--> statement-breakpoint
-- Two blocked visitors can share a network, so the network hash is no longer unique per owner.
DROP INDEX IF EXISTS blocked_devices_unique;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS blocked_devices_hash_idx ON blocked_devices (user_id, device_hash);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS blocked_devices_token_unique ON blocked_devices (user_id, session_token);
--> statement-breakpoint
-- Self-registrations per network per event, so one person cannot fill an event's paid places.
CREATE TABLE IF NOT EXISTS join_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS join_attempts_lookup ON join_attempts (event_id, ip_hash, created_at);
--> statement-breakpoint
-- Uploaded profile photos, re-encoded to small WebP by the server before they are stored.
CREATE TABLE IF NOT EXISTS user_photos (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL DEFAULT 'image/webp',
  bytes bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
