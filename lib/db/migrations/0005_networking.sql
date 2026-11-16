-- M6 + M7: finding people, saving them, and message requests. ADDITIVE ONLY.
-- Organisers get no grant on any of these tables: attendee conversations are private.
CREATE TABLE IF NOT EXISTS saved_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  saved_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_attendees_not_self CHECK (attendee_id <> saved_attendee_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS saved_attendees_once ON saved_attendees(attendee_id, saved_attendee_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  from_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  to_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT message_requests_not_self CHECK (from_attendee_id <> to_attendee_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS message_requests_once ON message_requests(from_attendee_id, to_attendee_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_requests_to_idx ON message_requests(to_attendee_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS event_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES message_requests(id) ON DELETE CASCADE,
  from_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS event_messages_request_idx ON event_messages(request_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS attendee_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  blocker_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  blocked_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS attendee_blocks_once ON attendee_blocks(blocker_attendee_id, blocked_attendee_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  reported_attendee_id uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  request_id uuid REFERENCES message_requests(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
