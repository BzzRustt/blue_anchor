-- Event cover photos, re-encoded to WebP by the server before they are stored (same idea as user_photos).
CREATE TABLE IF NOT EXISTS event_covers (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  mime text NOT NULL DEFAULT 'image/webp',
  bytes bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
