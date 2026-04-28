# ScanMe

A personal QR-code web app with two parts:

- **Public profile page** — what strangers see when they scan the QR code on your shirt. Shows your bio, a poll/question, a comment box, and social links.
- **Admin dashboard** — password-protected page only you can access. Shows scan analytics, poll results, and visitor comments.

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Postgres + Auth)
- [Zod](https://zod.dev/) (API input validation)

## Project Structure

```
app/              # Pages and API routes (App Router)
  api/            # Backend API routes
components/       # Reusable UI components
lib/
  supabase/
    client.ts     # Browser-side Supabase client
    server.ts     # Server-side Supabase client (API routes + Server Components)
types/
  database.ts     # TypeScript interfaces for all Supabase tables
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (found in Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **never expose this client-side** |
| `ADMIN_PASSWORD` | Password to access the admin dashboard |
| `ADMIN_ROUTE_NAME` | URL slug for the admin route (e.g. `secret-dashboard`) |
| `NEXT_PUBLIC_APP_URL` | Full public URL of the deployed app (e.g. `https://scanme.example.com`) |

## Supabase Setup

Create these three tables in your Supabase project:

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  bio text,
  poll_type text check (poll_type in ('multiple_choice', 'text')),
  poll_question text,
  poll_options text[],
  note_intro text,
  instagram text,
  survey_link text,
  created_at timestamptz default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz default now(),
  session_token text not null,
  ip_hash text
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  session_token text not null,
  poll_answer text,
  comment text,
  commenter_name text,
  device_hash text,
  submitted_at timestamptz default now()
);
```

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
