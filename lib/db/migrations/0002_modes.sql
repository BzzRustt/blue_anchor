-- M2: five Modes + profile fields + outbound click tracking. ADDITIVE ONLY: new enum values,
-- new nullable/defaulted columns and one new table. Old production code keeps working.
-- Applied by scripts/apply-migration.mjs (one statement at a time; ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds it). Not in drizzle's journal, like 0001_owner_auth.
-- Restore point taken first: Neon branch `restore-pre-m2-2026-11-15`.
ALTER TYPE mode ADD VALUE IF NOT EXISTS 'basic';
--> statement-breakpoint
ALTER TYPE mode ADD VALUE IF NOT EXISTS 'incognito';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS youtube text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_url text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS looking_for text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_offer text;
--> statement-breakpoint
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  target text NOT NULL,
  session_token text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS link_clicks_code_idx ON link_clicks (code_id, clicked_at DESC);
