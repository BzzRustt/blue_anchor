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
  blocked_devices, themes, theme_purchases, payouts, orders, link_clicks
TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON users, session, account, verification TO auth_user;

GRANT SELECT ON codes, campaigns, question_blocks TO visitor_user;
GRANT SELECT (id, name, image, bio, role, company, instagram, linkedin, website,
  tiktok, youtube, spotify, portfolio_url, interests, looking_for, can_offer)
  ON users TO visitor_user;
GRANT SELECT (id, user_id, device_hash) ON blocked_devices TO visitor_user;
GRANT SELECT (id, code_id, session_token, submitted_at) ON responses TO visitor_user;
GRANT INSERT (code_id, campaign_id, session_token, ip_hash) ON scans TO visitor_user;
GRANT INSERT (code_id, campaign_id, target, session_token) ON link_clicks TO visitor_user;
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
ALTER TABLE link_clicks      ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE link_clicks      FORCE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS link_clicks_owner ON link_clicks;
CREATE POLICY link_clicks_owner ON link_clicks TO app_user
  USING (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = link_clicks.code_id AND c.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM codes c
    WHERE c.id = link_clicks.code_id AND c.user_id = auth.user_id()
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

DROP POLICY IF EXISTS link_clicks_visitor_record ON link_clicks;
CREATE POLICY link_clicks_visitor_record ON link_clicks
  FOR INSERT TO visitor_user
  WITH CHECK (
    EXISTS (SELECT 1 FROM codes c WHERE c.id = link_clicks.code_id AND c.is_live)
    AND EXISTS (
      SELECT 1 FROM campaigns ca
      WHERE ca.id = link_clicks.campaign_id
        AND ca.code_id = link_clicks.code_id
        AND ca.status = 'live'
    )
  );

-- ===========================================================================
-- Events layer
--
-- Added alongside the personal product. No policy above is modified.
--
-- Two identities reach these tables:
--   * app_user      — the signed-in organiser, identified by auth.user_id()
--   * visitor_user   — an anonymous attendee. For reads, the gate is the event's own
--                      visibility window. For writes to their OWN profile, the app
--                      installs a transaction-local attendee claim (see
--                      lib/db/index.ts -> withAttendeeDb) and the policy below compares
--                      it per row, so a bug in the application cannot let one attendee
--                      overwrite another's card.
--
-- The access code is a low-entropy speed bump, not a secret: it is printed on every
-- badge and shown on a slide. It keeps the directory out of random crawlers' hands,
-- nothing more. It is only ever used inside a WHERE predicate, never selected.
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  events, event_attendees, event_lookups, connection_requests, reactions
TO app_user;

-- Attendees resolve an event and verify its access code. access_code is readable only
-- so it can be compared in a predicate.
GRANT SELECT (id, code_id, campaign_id, name, venue, starts_at, ends_at,
              access_code, role_set, directory_expires_at)
  ON events TO visitor_user;

-- The attendee's public card. email, claim_token and claimed_user_id are deliberately
-- absent: the directory must never be able to read them.
GRANT SELECT (id, event_id, tag, role_letter, display_name, answers, visibility, status)
  ON event_attendees TO visitor_user;
-- No INSERT grant for visitors: self-registration goes through register_attendee() below,
-- which enforces the plan cap and allocates the tag atomically. A direct insert could pick
-- any tag, any status, and skip the cap.
GRANT UPDATE (display_name, answers, visibility, status, updated_at)
  ON event_attendees TO visitor_user;

GRANT INSERT (event_id, target_attendee_id, viewer_attendee_id, session_token)
  ON event_lookups TO visitor_user;
GRANT INSERT (event_id, from_attendee_id, to_attendee_id) ON connection_requests TO visitor_user;
GRANT SELECT (id, event_id, from_attendee_id, to_attendee_id) ON connection_requests TO visitor_user;
GRANT INSERT (event_id, attendee_id, from_attendee_id, kind) ON reactions TO visitor_user;
GRANT SELECT (id, event_id, attendee_id, from_attendee_id, kind) ON reactions TO visitor_user;

ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_lookups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions           ENABLE ROW LEVEL SECURITY;

ALTER TABLE events              FORCE ROW LEVEL SECURITY;
ALTER TABLE event_attendees     FORCE ROW LEVEL SECURITY;
ALTER TABLE event_lookups       FORCE ROW LEVEL SECURITY;
ALTER TABLE connection_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE reactions           FORCE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Organiser. Every row is reached through events.user_id.
-- --------------------------------------------------------------------------

-- M4: an organiser can never publish their own event. New rows must be drafts with no capacity,
-- and UPDATE is column-granted without status/capacity/published_at/cancelled_at (see below).
-- Status moves only through event_set_status() and confirm_event_purchase().
DROP POLICY IF EXISTS events_organiser ON events;
DROP POLICY IF EXISTS events_organiser_read ON events;
CREATE POLICY events_organiser_read ON events FOR SELECT TO app_user USING (user_id = auth.user_id());
DROP POLICY IF EXISTS events_organiser_insert ON events;
CREATE POLICY events_organiser_insert ON events FOR INSERT TO app_user
  WITH CHECK (user_id = auth.user_id() AND status = 'draft' AND capacity IS NULL
              AND published_at IS NULL AND cancelled_at IS NULL);
DROP POLICY IF EXISTS events_organiser_update ON events;
CREATE POLICY events_organiser_update ON events FOR UPDATE TO app_user
  USING (user_id = auth.user_id()) WITH CHECK (user_id = auth.user_id());
DROP POLICY IF EXISTS events_organiser_delete ON events;
CREATE POLICY events_organiser_delete ON events FOR DELETE TO app_user USING (user_id = auth.user_id());

DROP POLICY IF EXISTS event_attendees_organiser ON event_attendees;
CREATE POLICY event_attendees_organiser ON event_attendees TO app_user
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_attendees.event_id AND e.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_attendees.event_id AND e.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS event_lookups_organiser ON event_lookups;
CREATE POLICY event_lookups_organiser ON event_lookups TO app_user
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_lookups.event_id AND e.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_lookups.event_id AND e.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS connection_requests_organiser ON connection_requests;
CREATE POLICY connection_requests_organiser ON connection_requests TO app_user
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = connection_requests.event_id AND e.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = connection_requests.event_id AND e.user_id = auth.user_id()
  ));

DROP POLICY IF EXISTS reactions_organiser ON reactions;
CREATE POLICY reactions_organiser ON reactions TO app_user
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = reactions.event_id AND e.user_id = auth.user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = reactions.event_id AND e.user_id = auth.user_id()
  ));

-- --------------------------------------------------------------------------
-- Anonymous attendees.
-- --------------------------------------------------------------------------

-- The directory is readable only while the event's code is live and the 48-hour
-- window has not closed. Once directory_expires_at passes, every read below
-- returns nothing — expiry is enforced here, not only in application code.
CREATE OR REPLACE FUNCTION public.event_directory_open(event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM events e
    JOIN codes c ON c.id = e.code_id
    WHERE e.id = event_id
      AND c.is_live
      AND e.status = 'published'
      AND now() < e.directory_expires_at
  );
$$;

REVOKE ALL ON FUNCTION public.event_directory_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_directory_open(uuid) TO app_user, visitor_user;

-- The attendee id the application has verified for this transaction, or NULL.
--
-- This sits on a security boundary, so it must never raise: a malformed, empty or
-- absent claim has to return NULL and let the policy deny cleanly. An earlier version
-- cast straight to jsonb and threw on an unset claim, which turned an anonymous write
-- into a 500 instead of a refusal. pg_input_is_valid (Postgres 16+) guards both casts.
CREATE OR REPLACE FUNCTION public.current_attendee_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  WITH raw AS (
    SELECT nullif(current_setting('request.jwt.claims', true), '') AS claims
  ),
  parsed AS (
    SELECT CASE
             WHEN claims IS NOT NULL AND pg_input_is_valid(claims, 'jsonb')
               THEN (claims::jsonb) ->> 'attendee'
           END AS attendee
    FROM raw
  )
  SELECT CASE
           WHEN attendee IS NOT NULL AND pg_input_is_valid(attendee, 'uuid')
             THEN attendee::uuid
         END
  FROM parsed;
$$;

REVOKE ALL ON FUNCTION public.current_attendee_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_attendee_id() TO visitor_user;

DROP POLICY IF EXISTS events_visitor_open ON events;
CREATE POLICY events_visitor_open ON events
  FOR SELECT TO visitor_user
  USING (public.event_directory_open(id));

-- Only completed cards appear, and only while the directory is open.
DROP POLICY IF EXISTS event_attendees_visitor_directory ON event_attendees;
CREATE POLICY event_attendees_visitor_directory ON event_attendees
  FOR SELECT TO visitor_user
  USING (status = 'complete' AND public.event_directory_open(event_id));

-- Superseded by register_attendee(); dropped so no direct insert path remains.
DROP POLICY IF EXISTS event_attendees_visitor_join ON event_attendees;

-- An attendee can always read their own card, whatever its status. Without this an
-- attendee who was imported or given a spare tag (status 'invited') could not load the
-- row they are about to complete, and an UPDATE ... WHERE would silently match nothing.
-- email, claim_token and claimed_user_id stay unreadable: column grants, not policies.
DROP POLICY IF EXISTS event_attendees_visitor_self_read ON event_attendees;
CREATE POLICY event_attendees_visitor_self_read ON event_attendees
  FOR SELECT TO visitor_user
  USING (id = public.current_attendee_id() AND public.event_directory_open(event_id));

-- Editing a card requires a verified attendee claim for that exact row, so an
-- application bug cannot let one attendee overwrite another's profile.
DROP POLICY IF EXISTS event_attendees_visitor_self_edit ON event_attendees;
CREATE POLICY event_attendees_visitor_self_edit ON event_attendees
  FOR UPDATE TO visitor_user
  USING (id = public.current_attendee_id() AND public.event_directory_open(event_id))
  WITH CHECK (id = public.current_attendee_id() AND public.event_directory_open(event_id));

-- --------------------------------------------------------------------------
-- Joining an event. Two SECURITY DEFINER functions, because the visitor role
-- deliberately cannot read invited rows, the organiser's plan, or other tags.
-- Both return only what the join page needs and nothing about email or claims.
-- --------------------------------------------------------------------------

-- What the join page needs to know about an event. Returns no row unless the directory is
-- open, so a closed, expired and nonexistent event look identical to the caller.
-- M4 added the capacity column, which changes the return type, so the old shape is dropped first.
DROP FUNCTION IF EXISTS public.join_event_info(text);
CREATE FUNCTION public.join_event_info(p_slug text)
RETURNS TABLE (
  event_id uuid,
  campaign_id uuid,
  event_name text,
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  directory_expires_at timestamptz,
  role_set jsonb,
  organiser_plan text,
  attendee_count integer,
  capacity integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.campaign_id, e.name, e.venue, e.starts_at, e.ends_at,
         e.directory_expires_at, e.role_set, u.plan::text,
         (SELECT count(*)::integer FROM event_attendees a WHERE a.event_id = e.id),
         e.capacity
  FROM codes c
  JOIN events e ON e.code_id = c.id
  JOIN users u ON u.id = e.user_id
  WHERE c.slug = p_slug
    AND c.kind = 'event'
    AND c.is_live
    AND e.status = 'published'
    AND now() < e.directory_expires_at;
$$;

REVOKE ALL ON FUNCTION public.join_event_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_event_info(text) TO visitor_user;

-- Self-registration. Serialised per event by an advisory lock so two people registering at
-- once can never be handed the same tag or push the event past its cap. The cap is passed in
-- by the application (computed from lib/plans.ts), which keeps plan limits single-sourced;
-- this function enforces it atomically. The tag format mirrors formatTag() in lib/events.ts.
-- Errors are short codes the application maps to wording.
CREATE OR REPLACE FUNCTION public.register_attendee(
  p_event_id uuid,
  p_name text,
  p_role_letter text,
  p_answers jsonb,
  p_max_attendees integer
)
RETURNS TABLE (attendee_id uuid, attendee_tag text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_letter text := nullif(upper(btrim(coalesce(p_role_letter, ''))), '');
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_roles jsonb;
  v_next integer;
  v_tag text;
  v_id uuid;
BEGIN
  IF NOT public.event_directory_open(p_event_id) THEN
    RAISE EXCEPTION 'event_closed';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_max_attendees IS NULL OR p_max_attendees < 1 THEN
    RAISE EXCEPTION 'invalid_cap';
  END IF;
  IF jsonb_typeof(v_answers) <> 'object' OR length(v_answers::text) > 8000 THEN
    RAISE EXCEPTION 'invalid_answers';
  END IF;

  SELECT e.role_set INTO v_roles FROM events e WHERE e.id = p_event_id;
  IF jsonb_typeof(v_roles) = 'array' AND jsonb_array_length(v_roles) > 0 THEN
    IF v_letter IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_roles) r WHERE r ->> 'letter' = v_letter
    ) THEN
      RAISE EXCEPTION 'invalid_role';
    END IF;
  ELSIF v_letter IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  IF (SELECT count(*) FROM event_attendees a WHERE a.event_id = p_event_id) >= p_max_attendees THEN
    RAISE EXCEPTION 'event_full';
  END IF;

  SELECT coalesce(max((regexp_match(a.tag, '(\d+)$'))[1]::integer), 0) + 1
    INTO v_next
  FROM event_attendees a
  WHERE a.event_id = p_event_id
    AND a.role_letter IS NOT DISTINCT FROM v_letter;

  v_tag := CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
  IF v_letter IS NOT NULL THEN
    v_tag := v_letter || '-' || v_tag;
  END IF;

  INSERT INTO event_attendees (event_id, tag, role_letter, display_name, answers, source, status)
  VALUES (p_event_id, v_tag, v_letter, v_name, v_answers, 'native', 'complete')
  RETURNING id INTO v_id;

  attendee_id := v_id;
  attendee_tag := v_tag;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.register_attendee(uuid, text, text, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_attendee(uuid, text, text, jsonb, integer) TO visitor_user;

DROP POLICY IF EXISTS event_lookups_visitor_record ON event_lookups;
CREATE POLICY event_lookups_visitor_record ON event_lookups
  FOR INSERT TO visitor_user
  WITH CHECK (public.event_directory_open(event_id));

-- A connect request must come from the verified attendee making it.
DROP POLICY IF EXISTS connection_requests_visitor_send ON connection_requests;
CREATE POLICY connection_requests_visitor_send ON connection_requests
  FOR INSERT TO visitor_user
  WITH CHECK (
    from_attendee_id = public.current_attendee_id()
    AND from_attendee_id <> to_attendee_id
    AND public.event_directory_open(event_id)
  );

-- An attendee sees only the requests they sent. Received requests are delivered by
-- email and, after claiming, through the owner workspace.
DROP POLICY IF EXISTS connection_requests_visitor_own ON connection_requests;
CREATE POLICY connection_requests_visitor_own ON connection_requests
  FOR SELECT TO visitor_user
  USING (from_attendee_id = public.current_attendee_id());

DROP POLICY IF EXISTS reactions_visitor_send ON reactions;
CREATE POLICY reactions_visitor_send ON reactions
  FOR INSERT TO visitor_user
  WITH CHECK (
    from_attendee_id = public.current_attendee_id()
    AND from_attendee_id <> attendee_id
    AND public.event_directory_open(event_id)
  );

-- Reaction counts stay private to the recipient: an attendee can read only the
-- reactions they themselves gave, never the tally on someone else's card.
DROP POLICY IF EXISTS reactions_visitor_own ON reactions;
CREATE POLICY reactions_visitor_own ON reactions
  FOR SELECT TO visitor_user
  USING (from_attendee_id = public.current_attendee_id());

-- --------------------------------------------------------------------------
-- M4: publishing. Column grants and the two functions that are the only way status moves.
-- --------------------------------------------------------------------------
REVOKE UPDATE ON events FROM app_user;
GRANT UPDATE (name, venue, starts_at, ends_at, access_code, role_set, directory_expires_at,
              timezone, description, cover_url, discovery, messaging_enabled,
              networking_opens_at, updated_at) ON events TO app_user;
GRANT SELECT (status, timezone, description, capacity) ON events TO visitor_user;

ALTER TABLE event_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_purchases FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON event_purchases TO app_user;
DROP POLICY IF EXISTS event_purchases_read ON event_purchases;
CREATE POLICY event_purchases_read ON event_purchases FOR SELECT TO app_user USING (user_id = auth.user_id());
DROP POLICY IF EXISTS event_purchases_insert ON event_purchases;
CREATE POLICY event_purchases_insert ON event_purchases FOR INSERT TO app_user
  WITH CHECK (user_id = auth.user_id() AND status = 'pending'
              AND EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.user_id = auth.user_id()));

-- Organiser moves their own event between draft and awaiting_payment, or cancels it. Never to published.
CREATE OR REPLACE FUNCTION public.event_set_status(p_event uuid, p_to text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_from text;
BEGIN
  SELECT status INTO v_from FROM events WHERE id = p_event AND user_id = auth.user_id();
  IF v_from IS NULL THEN RETURN false; END IF;
  IF (v_from = 'draft' AND p_to = 'awaiting_payment')
     OR (v_from = 'awaiting_payment' AND p_to = 'draft')
     OR (v_from IN ('draft','awaiting_payment','published') AND p_to = 'cancelled') THEN
    UPDATE events SET status = p_to, updated_at = now(),
           cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() ELSE cancelled_at END
     WHERE id = p_event;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.event_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_set_status(uuid, text) TO app_user;

-- Called only by the signature-verified Stripe webhook. Idempotent: a replayed webhook changes nothing.
CREATE OR REPLACE FUNCTION public.confirm_event_purchase(p_session text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_purchase event_purchases%ROWTYPE;
BEGIN
  UPDATE event_purchases SET status = 'paid', paid_at = now()
   WHERE stripe_session_id = p_session AND status = 'pending'
   RETURNING * INTO v_purchase;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE events SET status = 'published', capacity = greatest(coalesce(capacity, 0), v_purchase.capacity),
         published_at = coalesce(published_at, now()), updated_at = now()
   WHERE id = v_purchase.event_id AND status IN ('draft','awaiting_payment','published');
  RETURN v_purchase.event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_event_purchase(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_event_purchase(text) TO visitor_user;

