-- M4: event status flow (draft -> awaiting_payment -> published | cancelled), per-event capacity,
-- timezone, networking settings and purchase records. ADDITIVE ONLY. Existing events default to
-- 'published' so production keeps working; new events are created as 'draft' by the new code.
-- Restore point to take first: a Neon branch (restore-pre-m4-...). Apply with scripts/apply-migration.mjs.
ALTER TABLE events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','awaiting_payment','published','cancelled'));
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_url text;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100000);
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS discovery text NOT NULL DEFAULT 'badge' CHECK (discovery IN ('off','badge','directory'));
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS messaging_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS networking_opens_at timestamptz;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at timestamptz;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
--> statement-breakpoint
UPDATE events SET published_at = created_at WHERE published_at IS NULL AND status = 'published';
--> statement-breakpoint
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS external_ref text;
--> statement-breakpoint
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS event_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_key text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  amount_pence integer NOT NULL CHECK (amount_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS event_purchases_event_idx ON event_purchases(event_id);
