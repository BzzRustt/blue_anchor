# ScanMe test script (test environment only)

Runs against the isolated test environment at `http://localhost:3000` (separate test database, Stripe **test mode**, email captured to a file). It never touches the live site.

After each test, the tester writes **Result** (`PASS`, `FAIL`, or `MINOR` = works but something is off that we can live with) and a plain-English **Comment** (what was seen; if not PASS, how serious it is and whether it can be ignored for launch).

## Accounts (all `@demo.scanme.test`; one shared password, given separately)

| Login | Plan | Use it for |
|---|---|---|
| `basic@demo.scanme.test` | Free | Everyday free user, Basic Mode, full inbox (unread, archived, blocked) |
| `incognito@demo.scanme.test` | Free | Incognito Mode |
| `attendee@demo.scanme.test` | Free | A person who attended events (linked to the Summit) |
| `organiser2@demo.scanme.test` | Free | Free organiser with two draft events (paying to publish) |
| `newuser@demo.scanme.test` | Free | **Clean account for the real Stripe Pro purchase** |
| `organiser@demo.scanme.test` | Pro (seeded) | Organiser with live, ended, upcoming and closed events |
| `creator@demo.scanme.test`, `portfolio@demo.scanme.test` | Pro (seeded) | Creator and Portfolio Modes |

Stripe test cards (any future expiry, any CVC, any postcode): success `4242 4242 4242 4242`; declined `4000 0000 0000 0002`.
Public pages: personal page `/t/<code>` (codes: basic `b1b484e4c99c`, incognito `441dcfb8a9ab`, creator `6593749d0d54`, portfolio `14e4a7ccf7bf`, organiser `2708bcd8538e`). Events: Summit (live now) `/e/demo-founders-summit-e17c17`, access code `AJ5NE`; Product Breakfast (ended 3h ago) `/e/demo-product-breakfast-640dce`, `6G8BS`; Design Night (next week) `/e/demo-design-night-c2c821`, `JFDGJ`; Old Meetup (closed) `/e/demo-old-meetup-9c0a77`, `7HXTG`; Supper Club (draft, organiser2) `/e/demo-supper-club-3fe33d`, `HFRJD`.

---

## A. Signing in and out
- **A1** Log in as `basic@`. *Expect:* lands on Home, "Free plan", name shown, unread count in the menu.
- **A2** Try a wrong password. *Expect:* a clear error, no crash, not logged in.
- **A3** Log out, then open `/app`. *Expect:* sent to the login page.
- **A4** Sign up a brand-new account (any new `@demo.scanme.test` email). *Expect:* account created; if an emailed code or link is part of it, it appears in `.test-outbox/emails.jsonl` and works.

## B. Profile and Modes
- **B1** As `basic@`, edit Profile (change role text), save. *Expect:* "Profile saved" and the change persists after a reload.
- **B2** Open Modes as a Free user. *Expect:* Basic, Networking, Incognito can be chosen; Creator and Portfolio are clearly marked as Pro.
- **B3** Switch the active Mode (Basic to Networking and back). *Expect:* the active label changes; the QR link stays the same.
- **B4** Open "Visitor preview" for the active Mode. *Expect:* shows what a visitor sees, matching the profile.
- **B5** As `creator@` open the Creator preview, and as `portfolio@` the Portfolio preview. *Expect:* each shows its own layout (links/projects).

## C. A visitor scans a code and the owner's inbox
- **C1** Logged out, open `/t/b1b484e4c99c`, answer, and send a message. *Expect:* a "Sent privately" confirmation.
- **C2** As `basic@`, open the inbox on Home. *Expect:* the new response is at the top, marked New, labelled with the right Mode, unread count went up by one.
- **C3** Open that response. *Expect:* full text visible; it becomes read and the unread count drops.
- **C4** Archive a response, then find it under the Archived filter and restore it. *Expect:* it moves in and out correctly.
- **C5** Use the filters (All, Unread, Archived, Blocked) and the Mode filter. *Expect:* each shows the right items, counts match.
- **C6** Block a visitor on a response. *Expect:* confirmation prompt first; it appears under Blocked afterwards.
- **C7** As a visitor open `/t/441dcfb8a9ab` (Incognito) and send a message; check as `incognito@`. *Expect:* arrives under Incognito, no identity details exposed.

## D. Events: organiser side
- **D1** As `organiser@`, open Events. *Expect:* live, ended, upcoming and closed events listed with correct states.
- **D2** Open the live Summit. *Expect:* registered/checked-in/places-left numbers, the join link and access code, attendee list.
- **D3** Open Badges for an event. *Expect:* badge page and CSV download work.
- **D4** As `organiser2@`, create a new event with plain badge numbers. *Expect:* created as Draft, "not public", free to preview.
- **D5** As `organiser2@`, create an event leaving the roles box as it is. *Expect:* a clear "role letters are a Pro feature" message, nothing broken.
- **D6** Use "Attendee view" on a draft event. *Expect:* preview of what attendees will see.
- **D7** As `organiser@` change an event's details/reschedule. *Expect:* saves and shows the new details.

## E. Events: attendee side
- **E1** Logged out, open Summit, register with access code `AJ5NE` (choose a role, fill the required answers). *Expect:* "You are in", a badge tag is shown.
- **E2** Try registering with a wrong access code. *Expect:* a clear error and what you typed is kept.
- **E3** Open the Design Night join page (starts next week). *Expect:* registration works; networking features are not open yet.
- **E4** As a registered attendee, open People, search by name, open a card, and Save a person. *Expect:* results, card, and the Saved list updates.
- **E5** Send a message request to another attendee. *Expect:* "Request sent".
- **E6** As that other attendee (second private window), accept it, reply, and read the reply back as the first. *Expect:* both sides see the whole conversation, tied to the event, with the close time shown.
- **E7** Decline another request, and block a sender. *Expect:* declined/blocked clearly confirmed; blocked sender cannot message again.
- **E8** Open the Product Breakfast (ended 3 hours ago). *Expect:* existing conversations still reply; new requests are not allowed.
- **E9** Open the Old Meetup (closed). *Expect:* "This event isn't open" with no join form.
- **E10** As `attendee@` open Events, Attending. *Expect:* the Summit conversations are kept read-only after the event.

## F. Payments (Stripe test mode)
- **F1** As `newuser@` (Free), Profile, "Upgrade to Pro", pay with 4242. *Expect:* returns to Profile showing Pro (it may take a few seconds); database/plan says Pro because Stripe's verified message arrived.
- **F2** As that Pro account, check Pro features. *Expect:* Creator and Portfolio Modes selectable; Photo QR download enabled.
- **F3** As `basic@` visit `/app/profile?pro=1` without paying. *Expect:* still Free; only a "confirming" note.
- **F4** As `basic@` start the Pro checkout and pay with the declined card. *Expect:* "Your card was declined"; still Free.
- **F5** As `basic@` start the Pro checkout and use the back arrow. *Expect:* returns to Profile; still Free; no charge.
- **F6** As `newuser@` (now Pro), click "Manage or cancel Pro". *Expect:* Stripe's billing page opens.
- **F7** Cancel `newuser@`'s subscription (use Stripe's billing page, or the Stripe CLI/API). *Expect:* plan returns to Free shortly after.
- **F8** Send a webhook with a wrong signature to `/api/stripe/webhook`. *Expect:* rejected (400); nothing changes.
- **F9** Re-send a genuine paid Stripe event after cancelling. *Expect:* accepted, but the account stays Free.
- **F10** As `organiser2@`, open draft "Journey Pop-up Supper", choose "Up to 50 attendees", Pay and publish with 4242. *Expect:* returns to the event as Published, 50 places, the public page is open.
- **F11** Register as an attendee on that event, then refund the payment in Stripe (CLI/API). *Expect:* the event returns to Draft, public page says "This event isn't open", the registration is kept.
- **F12** Start an event checkout, then abandon it (let it expire or expire it via Stripe). *Expect:* event is not published; the pending purchase ends as failed.

## G. Photo QR
- **G1** As `basic@` (Free), open Photo QR, choose a picture, pick Photo style. *Expect:* preview works, software check passes (e.g. 8 of 8), Download is disabled with an upgrade note.
- **G2** As `organiser@` (Pro), repeat. *Expect:* Download PNG is enabled.
- **G3** Use "Reset to standard QR". *Expect:* back to the standard code, same link.

## H. Account, data and pages
- **H1** Open Settings, "download my data". *Expect:* a file downloads with the account's data.
- **H2** On the **new account from A4 only**, delete the account. *Expect:* confirmation first, account removed, can no longer log in.
- **H3** Open Plans, How it works, and the legal pages. *Expect:* all load; Plans shows no Pro price (known and intended).
- **H4** Open the Shop and register interest in an item. *Expect:* interest saved, clear confirmation.

## I. Look and feel
- **I1** At phone width (390 px), open Home, Modes, Profile, Events, a public personal page, an event join page, Plans. *Expect:* nothing scrolls sideways, text readable, buttons reachable.
- **I2** Same pages at desktop width (1280 px). *Expect:* tidy layout.
- **I3** Switch light/dark. *Expect:* both readable, setting remembered after reload.
- **I4** Note anything confusing, ugly or slow (more than about 5 seconds). *Expect:* list it with a severity.

## J. Safety
- **J1** As `basic@` try to open another user's event admin page (an `organiser@` event URL). *Expect:* not found or refused, no data shown.
- **J2** Logged out, try `/app/events`, `/app/profile`. *Expect:* sent to login.
- **J3** As a visitor, try another organiser's draft event URL. *Expect:* "This event isn't open".
