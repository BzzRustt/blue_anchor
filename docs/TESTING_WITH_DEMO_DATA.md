# Testing with demo data

Demo data lets you click through every ScanMe screen with realistic content, then remove it in one step.

## Commands (run from this folder)
- `npm run demo:seed`: creates the demo data. It prints the shared password, logins, join pages, access codes and attendee links. Add `-- --site=https://your-site` so the printed links use your live address.
- `npm run demo:delete -- --dry`: shows what would be removed.
- `npm run demo:delete`: removes all of it.

Seeding refuses to run twice; delete first to reset. Event times are relative to when you seed (the summit is "live" for 36 hours), so re-seed to reset the timeline.

## What it creates
- **8 accounts** at `@demo.scanme.test`, all with one password, which is printed by the seed:

| Account | Plan | Shows |
|---|---|---|
| organiser | Pro | Networking Mode; runs the demo events |
| creator | Pro | Creator Mode: featured item, links, poll |
| portfolio | Pro | Portfolio Mode, Visual style |
| basic | Free | Basic Mode; Pro Modes locked |
| incognito | Free | Incognito Mode (the owner's name must never show) |
| attendee | Free | Linked to an attendee card at the summit ("Attending") |
| organiser2 | Free | A draft event and a cancelled event |
| newuser | Free | An empty account |

- **Personal side:** about 174 visitor responses over 30 days, with visits and link clicks. Responses are a mix of read, unread, archived, reported and from a blocked device.
- **6 events:** a summit that is live now (40 attendees, role letters, directory, messaging), a breakfast that ended 3 hours ago (48-hour follow-up), a design night next week, a closed meetup, a draft and a cancelled event. They are published directly, so no payment is involved.
- **Networking:** saved people, message requests (pending, accepted with conversations, declined, blocked) and a report.
- **5 attendee links:** each signs a browser in as one attendee. Open each in its own private window.

## How deletion stays safe
- Demo accounts are matched only when the id starts with `demo-` **and** the email ends with `@demo.scanme.test`. No real account can match both.
- Every other demo row belongs to those accounts and is removed by the database's cascades.
- Attendees who join a demo event from a real phone belong to that demo event, so they go too.

## Not covered by demo data
- Paying to publish, and Pro upgrades (Stripe keys needed).
- Emails (the Resend domain must be verified).
- Google sign-in (a Google key is needed).

The step-by-step checklist lives as a private page; ask Claude for the link.
