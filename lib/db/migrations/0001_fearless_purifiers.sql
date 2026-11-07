-- Events layer: enums, codes.kind, and the five event tables.
--
-- Reduced from the generated diff: the auth tables and users columns it also contained
-- were already applied by the hand-written 0001_owner_auth.sql, which ran outside the
-- drizzle journal and left the meta snapshot stale. meta/0001_snapshot.json now matches
-- both schema.ts and the live database, so future `generate` runs diff from a correct
-- baseline.

CREATE TYPE "public"."attendee_source" AS ENUM('native', 'import', 'embedded', 'walk_up');;
--> statement-breakpoint
CREATE TYPE "public"."attendee_status" AS ENUM('invited', 'complete', 'withdrawn');;
--> statement-breakpoint
CREATE TYPE "public"."code_kind" AS ENUM('personal', 'event');;
--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('like', 'applaud');;
--> statement-breakpoint
CREATE TABLE "connection_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"from_attendee_id" uuid NOT NULL,
	"to_attendee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"role_letter" text,
	"display_name" text NOT NULL,
	"email" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "attendee_source" DEFAULT 'native' NOT NULL,
	"status" "attendee_status" DEFAULT 'invited' NOT NULL,
	"claimed_user_id" text,
	"claim_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "event_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"target_attendee_id" uuid NOT NULL,
	"viewer_attendee_id" uuid,
	"session_token" text NOT NULL,
	"looked_up_at" timestamp with time zone DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"venue" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"access_code" text NOT NULL,
	"role_set" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"directory_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);;
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"from_attendee_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);;
--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "kind" "code_kind" DEFAULT 'personal' NOT NULL;;
--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_from_attendee_id_event_attendees_id_fk" FOREIGN KEY ("from_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_to_attendee_id_event_attendees_id_fk" FOREIGN KEY ("to_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "event_lookups" ADD CONSTRAINT "event_lookups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "event_lookups" ADD CONSTRAINT "event_lookups_target_attendee_id_event_attendees_id_fk" FOREIGN KEY ("target_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "event_lookups" ADD CONSTRAINT "event_lookups_viewer_attendee_id_event_attendees_id_fk" FOREIGN KEY ("viewer_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE set null ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_code_id_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."codes"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_attendee_id_event_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_from_attendee_id_event_attendees_id_fk" FOREIGN KEY ("from_attendee_id") REFERENCES "public"."event_attendees"("id") ON DELETE cascade ON UPDATE no action;;
--> statement-breakpoint
CREATE UNIQUE INDEX "connection_requests_once" ON "connection_requests" USING btree ("event_id","from_attendee_id","to_attendee_id");;
--> statement-breakpoint
CREATE INDEX "connection_requests_to_idx" ON "connection_requests" USING btree ("to_attendee_id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_tag_unique" ON "event_attendees" USING btree ("event_id","tag");;
--> statement-breakpoint
CREATE INDEX "event_attendees_event_idx" ON "event_attendees" USING btree ("event_id");;
--> statement-breakpoint
CREATE INDEX "event_attendees_claimed_idx" ON "event_attendees" USING btree ("claimed_user_id");;
--> statement-breakpoint
CREATE INDEX "event_lookups_report_idx" ON "event_lookups" USING btree ("event_id","looked_up_at" DESC NULLS LAST);;
--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" USING btree ("user_id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "events_code_unique" ON "events" USING btree ("code_id");;
--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_once" ON "reactions" USING btree ("event_id","attendee_id","from_attendee_id","kind");;
--> statement-breakpoint
CREATE INDEX "reactions_attendee_idx" ON "reactions" USING btree ("attendee_id");;
