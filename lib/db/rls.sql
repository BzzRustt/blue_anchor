-- Row Level Security policies.
--
-- Written as SQL rather than generated, because policies are the file a security
-- reviewer reads. Apply after every migration:  npm run db:rls
--
-- Depends on Neon RLS (the pg_session_jwt extension), which validates the auth
-- provider's JWT and exposes auth.user_id() to Postgres. Until the auth slice threads
-- the session JWT through to the database connection, these policies are a second line
-- of defence behind the application-level userId scoping in lib/db/index.ts — they must
-- be live and authoritative before any third party can reach this database.
--
-- Visitor-facing writes (scans, responses) do NOT pass through these policies: a visitor
-- is never authenticated. Those inserts go through the server on the owner's behalf and
-- are rate limited and validated in the API route instead.

CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- ---------------------------------------------------------------------------
-- Least-privilege application role.
--
-- The connection string Neon hands out is neondb_owner, which holds BYPASSRLS: every
-- policy below is INERT for it. Verified empirically — see `npm run db:verify`, which
-- reads a row with no JWT present.
--
-- So the application must not connect as the owner. This role has no BYPASSRLS and only
-- the grants it needs, which makes the policies authoritative.
--
-- Sequencing, because the two halves must land together:
--   1. (here) create the role and grant it table access
--   2. (auth slice) thread the session JWT through pg_session_jwt so auth.user_id()
--      resolves, point DATABASE_URL at this role, then ALTER TABLE ... FORCE ROW LEVEL
--      SECURITY so even a future owner connection is subject to policy
--
-- Switching DATABASE_URL to this role BEFORE step 2 breaks every read: with no JWT,
-- auth.user_id() is null and each policy correctly denies everything.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- No DDL, no TRUNCATE, no ownership. Migrations keep running as the owner.
REVOKE CREATE ON SCHEMA public FROM app_user;

-- ---------------------------------------------------------------------------
-- Owner-scoped tables: an owner sees and writes only their own rows.
-- ---------------------------------------------------------------------------

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_purchases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
  USING (id = auth.user_id())
  WITH CHECK (id = auth.user_id());

DROP POLICY IF EXISTS codes_owner ON codes;
CREATE POLICY codes_owner ON codes
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS campaigns_owner ON campaigns;
CREATE POLICY campaigns_owner ON campaigns
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS responses_owner ON responses;
CREATE POLICY responses_owner ON responses
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS replies_owner ON replies;
CREATE POLICY replies_owner ON replies
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS blocked_devices_owner ON blocked_devices;
CREATE POLICY blocked_devices_owner ON blocked_devices
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS orders_owner ON orders;
CREATE POLICY orders_owner ON orders
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS payouts_author ON payouts;
CREATE POLICY payouts_author ON payouts
  USING (author_id = auth.user_id())
  WITH CHECK (author_id = auth.user_id());

-- ---------------------------------------------------------------------------
-- Tables reached through a parent. These carry no user_id of their own, so the
-- policy joins to the parent once. Keep the parent's id indexed.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS question_blocks_owner ON question_blocks;
CREATE POLICY question_blocks_owner ON question_blocks
  USING (EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = question_blocks.campaign_id AND c.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = question_blocks.campaign_id AND c.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS scans_owner ON scans;
CREATE POLICY scans_owner ON scans
  USING (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = scans.code_id AND c.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = scans.code_id AND c.user_id = auth.user_id()
  ));

-- ---------------------------------------------------------------------------
-- Marketplace. Themes are the one table with a deliberately public read path:
-- a listed theme must be visible to every signed-in buyer. Writes stay with the author.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS themes_read_listed ON themes;
CREATE POLICY themes_read_listed ON themes
  FOR SELECT
  USING (status = 'listed' OR author_id = auth.user_id());

DROP POLICY IF EXISTS themes_write_author ON themes;
CREATE POLICY themes_write_author ON themes
  FOR ALL
  USING (author_id = auth.user_id())
  WITH CHECK (author_id = auth.user_id());

-- A buyer sees their own purchases; an author sees sales of their themes, because that
-- is their earnings record.
DROP POLICY IF EXISTS theme_purchases_party ON theme_purchases;
CREATE POLICY theme_purchases_party ON theme_purchases
  USING (
    buyer_id = auth.user_id()
    OR EXISTS (
      SELECT 1 FROM themes t
      WHERE t.id = theme_purchases.theme_id AND t.author_id = auth.user_id()
    )
  )
  WITH CHECK (buyer_id = auth.user_id());
