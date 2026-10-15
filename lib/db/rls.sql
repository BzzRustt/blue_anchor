-- ScanMe runtime roles and row-level security policies.
--
-- Apply after every migration: npm run db:rls
-- Runtime role passwords are never stored here. `npm run db:provision-runtime`
-- creates them and writes the resulting URLs only to the ignored .env.local file.
--
-- auth.user_id() is supplied from a transaction-local, server-verified Better Auth
-- session claim. Runtime roles are deliberately separate: auth_user persists sessions,
-- app_user handles signed-in owner data, and visitor_user sees only live public fields.

CREATE EXTENSION IF NOT EXISTS pg_session_jwt;

-- ---------------------------------------------------------------------------
-- Roles and least-privilege grants.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_user') THEN
    CREATE ROLE auth_user NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'visitor_user') THEN
    CREATE ROLE visitor_user NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Neon project owners can create restricted roles but cannot change attributes
-- reserved for a true PostgreSQL superuser (including SUPERUSER/BYPASSRLS). New
-- roles already receive these safe defaults above. For pre-existing roles, fail
-- closed instead of attempting an ALTER ROLE that Neon will reject.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN ('app_user', 'auth_user', 'visitor_user')
      AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'ScanMe runtime roles must not have administrative or RLS-bypass attributes';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user, auth_user, visitor_user;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user, auth_user, visitor_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_user, auth_user, visitor_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, codes, campaigns, question_blocks, responses, replies, scans,
  blocked_devices, themes, theme_purchases, payouts, orders
TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON users, session, account, verification TO auth_user;

GRANT SELECT ON codes, campaigns, question_blocks TO visitor_user;
GRANT SELECT (id, name, image, bio, role, company, instagram, linkedin, website)
  ON users TO visitor_user;
GRANT SELECT (id, user_id, device_hash) ON blocked_devices TO visitor_user;
GRANT SELECT (id, code_id, session_token, submitted_at) ON responses TO visitor_user;
GRANT INSERT (code_id, campaign_id, session_token, ip_hash) ON scans TO visitor_user;
GRANT INSERT (user_id, campaign_id, code_id, session_token, answers, contact, device_hash)
  ON responses TO visitor_user;

-- No DDL, no TRUNCATE and no ownership. Migrations continue to use the owner URL.
REVOKE CREATE ON SCHEMA public FROM app_user, auth_user, visitor_user;

-- ---------------------------------------------------------------------------
-- Enable and force RLS on every runtime table.
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
ALTER TABLE session          ENABLE ROW LEVEL SECURITY;
ALTER TABLE account          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification     ENABLE ROW LEVEL SECURITY;

ALTER TABLE users            FORCE ROW LEVEL SECURITY;
ALTER TABLE codes            FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns        FORCE ROW LEVEL SECURITY;
ALTER TABLE question_blocks  FORCE ROW LEVEL SECURITY;
ALTER TABLE responses        FORCE ROW LEVEL SECURITY;
ALTER TABLE replies          FORCE ROW LEVEL SECURITY;
ALTER TABLE scans            FORCE ROW LEVEL SECURITY;
ALTER TABLE blocked_devices  FORCE ROW LEVEL SECURITY;
ALTER TABLE themes           FORCE ROW LEVEL SECURITY;
ALTER TABLE theme_purchases  FORCE ROW LEVEL SECURITY;
ALTER TABLE payouts          FORCE ROW LEVEL SECURITY;
ALTER TABLE orders           FORCE ROW LEVEL SECURITY;
ALTER TABLE session          FORCE ROW LEVEL SECURITY;
ALTER TABLE account          FORCE ROW LEVEL SECURITY;
ALTER TABLE verification     FORCE ROW LEVEL SECURITY;

-- Better Auth service policies. This role has no grants on product tables.
DROP POLICY IF EXISTS users_auth_service ON users;
CREATE POLICY users_auth_service ON users TO auth_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS session_auth_service ON session;
CREATE POLICY session_auth_service ON session TO auth_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS account_auth_service ON account;
CREATE POLICY account_auth_service ON account TO auth_user
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS verification_auth_service ON verification;
CREATE POLICY verification_auth_service ON verification TO auth_user
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Signed-in owner policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users TO app_user
  USING (id = auth.user_id())
  WITH CHECK (id = auth.user_id());

DROP POLICY IF EXISTS codes_owner ON codes;
CREATE POLICY codes_owner ON codes TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS campaigns_owner ON campaigns;
CREATE POLICY campaigns_owner ON campaigns TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS responses_owner ON responses;
CREATE POLICY responses_owner ON responses TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS replies_owner ON replies;
CREATE POLICY replies_owner ON replies TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS blocked_devices_owner ON blocked_devices;
CREATE POLICY blocked_devices_owner ON blocked_devices TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS orders_owner ON orders;
CREATE POLICY orders_owner ON orders TO app_user
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS payouts_author ON payouts;
CREATE POLICY payouts_author ON payouts TO app_user
  USING (author_id = auth.user_id())
  WITH CHECK (author_id = auth.user_id());

DROP POLICY IF EXISTS question_blocks_owner ON question_blocks;
CREATE POLICY question_blocks_owner ON question_blocks TO app_user
  USING (EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = question_blocks.campaign_id AND c.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = question_blocks.campaign_id AND c.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS scans_owner ON scans;
CREATE POLICY scans_owner ON scans TO app_user
  USING (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = scans.code_id AND c.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = scans.code_id AND c.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS themes_read_listed ON themes;
CREATE POLICY themes_read_listed ON themes
  FOR SELECT TO app_user
  USING (status = 'listed' OR author_id = auth.user_id());

DROP POLICY IF EXISTS themes_write_author ON themes;
CREATE POLICY themes_write_author ON themes
  FOR ALL TO app_user
  USING (author_id = auth.user_id())
  WITH CHECK (author_id = auth.user_id());

DROP POLICY IF EXISTS theme_purchases_party ON theme_purchases;
CREATE POLICY theme_purchases_party ON theme_purchases TO app_user
  USING (
    buyer_id = auth.user_id()
    OR EXISTS (
      SELECT 1 FROM themes t
      WHERE t.id = theme_purchases.theme_id AND t.author_id = auth.user_id()
    )
  )
  WITH CHECK (buyer_id = auth.user_id());

-- ---------------------------------------------------------------------------
-- Anonymous visitor policies. Column grants above prevent access to email,
-- plans, response answers and other private fields even when a row is visible.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS codes_visitor_live ON codes;
CREATE POLICY codes_visitor_live ON codes
  FOR SELECT TO visitor_user
  USING (is_live);

DROP POLICY IF EXISTS campaigns_visitor_live ON campaigns;
CREATE POLICY campaigns_visitor_live ON campaigns
  FOR SELECT TO visitor_user
  USING (
    status = 'live'
    AND EXISTS (SELECT 1 FROM codes c WHERE c.id = campaigns.code_id AND c.is_live)
  );

DROP POLICY IF EXISTS users_visitor_public ON users;
CREATE POLICY users_visitor_public ON users
  FOR SELECT TO visitor_user
  USING (EXISTS (
    SELECT 1
    FROM codes c
    JOIN campaigns ca ON ca.code_id = c.id AND ca.status = 'live'
    WHERE c.user_id = users.id AND c.is_live
  ));

DROP POLICY IF EXISTS question_blocks_visitor_live ON question_blocks;
CREATE POLICY question_blocks_visitor_live ON question_blocks
  FOR SELECT TO visitor_user
  USING (EXISTS (
    SELECT 1 FROM campaigns ca
    WHERE ca.id = question_blocks.campaign_id AND ca.status = 'live'
  ));

DROP POLICY IF EXISTS blocked_devices_visitor_check ON blocked_devices;
CREATE POLICY blocked_devices_visitor_check ON blocked_devices
  FOR SELECT TO visitor_user
  USING (EXISTS (
    SELECT 1 FROM codes c WHERE c.user_id = blocked_devices.user_id AND c.is_live
  ));

DROP POLICY IF EXISTS responses_visitor_repeat_check ON responses;
CREATE POLICY responses_visitor_repeat_check ON responses
  FOR SELECT TO visitor_user
  USING (EXISTS (
    SELECT 1 FROM codes c WHERE c.id = responses.code_id AND c.is_live
  ));

DROP POLICY IF EXISTS responses_visitor_submit ON responses;
CREATE POLICY responses_visitor_submit ON responses
  FOR INSERT TO visitor_user
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM codes c
      WHERE c.id = responses.code_id AND c.user_id = responses.user_id AND c.is_live
    )
    AND EXISTS (
      SELECT 1 FROM campaigns ca
      WHERE ca.id = responses.campaign_id
        AND ca.code_id = responses.code_id
        AND ca.status = 'live'
    )
  );

DROP POLICY IF EXISTS scans_visitor_record ON scans;
CREATE POLICY scans_visitor_record ON scans
  FOR INSERT TO visitor_user
  WITH CHECK (
    EXISTS (SELECT 1 FROM codes c WHERE c.id = scans.code_id AND c.is_live)
    AND EXISTS (
      SELECT 1 FROM campaigns ca
      WHERE ca.id = scans.campaign_id
        AND ca.code_id = scans.code_id
        AND ca.status = 'live'
    )
  );
