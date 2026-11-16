-- M10: "Register interest" in a shop product. ADDITIVE ONLY. Owner-only via RLS.
CREATE TABLE IF NOT EXISTS shop_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product text NOT NULL CHECK (product IN ('shirt', 'card', 'stickers', 'event_badges')),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS shop_interests_once ON shop_interests(user_id, product);
