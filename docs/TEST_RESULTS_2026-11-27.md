# ScanMe test results, 27 Nov 2026

Run against the isolated test environment only (localhost:3000, test database, Stripe test mode). No code was changed. Screenshots were taken in headless Edge; load times below include slow first-visit compiling of the development server.

## Summary

**Counts (59 tests):** 51 PASS, 6 MINOR, 2 FAIL, 0 NOT RUN.

**Top issues, most serious first**
1. **H3 FAIL, blocker for launch:** there are no legal pages at all. `/privacy` and `/terms` show "Wrong turn 404", and the site footer has no links to any. A product that collects emails and takes card payments needs a privacy notice and terms before real users.
2. **D6 FAIL, should fix soon:** on a draft event, the "Attendee view" button opens the public page, which says "This event isn't open". The organiser cannot preview what attendees will see before paying, although the page promises you can "preview first, free".
3. **I1/I2 MINOR, should fix soon:** the Plans page is the one page that scrolls sideways on a phone (390 px). Its header colour-theme button is cut off. On the Free plan card the "Start free" button overlaps the last bullet point, on phone and desktop.
4. **D5 MINOR, should fix soon:** the new-event form pre-fills role letters (F=Founder...). A Free organiser who creates an event without changing that hits an error, and the form comes back empty, so they retype everything.
5. **Plans vs payments mismatch (I4), should fix before opening Pro:** Plans says "Pro is not open yet / price to be confirmed", but Profile offers "Upgrade to Pro" and Stripe really charges GBP 9.00 a month.
6. **D1 MINOR:** the organiser Events list and each event show only "Published". Live, ended and closed are not shown, so the organiser cannot tell the Old Meetup (closed) from the live Summit.
7. **H1 MINOR:** "download my data" includes visitors' technical identifiers (session token, device hash) on every response. No passwords or keys, but worth removing.

**Overall verdict.** The core product is in good shape for a small first release. Everything that matters worked first time: sign-in and out, Modes, QR/visitor responses, the inbox (read, archive, block, filters), event creation, joining, messaging, accept/decline/block, the ended and closed event rules, and all three Stripe flows (subscription, declined card, cancel, one-off event payment, refund, expiry) with correct plan changes driven by Stripe's signed messages. Security checks passed (forged webhook rejected, other people's events and drafts hidden, logged-out redirects). Two things should be dealt with before real users arrive: add privacy and terms pages (blocker), and fix the draft event preview. The rest is polish. Pro pricing wording needs to be settled before Pro is opened.

**Look and feel observations**
- Calm, consistent dark green design with a good light theme; both are readable and the choice is remembered after reload. The Home screen and the mobile bottom bar look polished.
- Confirmations are short toasts that disappear after about 4 seconds ("Changes saved", "Declined. They will not be told why.", "Blocked..."). Easy to miss for a slow reader; the wording itself is clear and kind.
- Plain, friendly wording throughout, but some small gaps: the inbox preview of an Incognito rating shows only "1"; the new-account Home starts with "Sharing paused" and little explanation; the Stripe pages say "BzzR Options" (the Stripe account name) rather than ScanMe.
- Pages felt quick: about 2.5 seconds per page on a heavily loaded test machine, nothing over 5 seconds apart from first-time compiling.
- A few tight spots: the Plans Free card overlap, the event list lacking status badges, and the event-card page not explaining why the "send request" box is missing after an event has ended (the Messages page does explain it).

**Notes on shared test data I changed:** Summit is now full (50 of 50): my E1 registration took the last place. I created accounts and events: `qa...@demo.scanme.test` (deleted in H2), "QA Plain Event 29098" (draft, organiser2), several `QA ...` attendees on the Summit and Design Night, three message requests from "QA Attendee 541386" (one accepted, one declined, one blocked), one blocked visitor and one extra inbox response on `basic@`, one response on `incognito@`. `newuser@` was bought up to Pro and cancelled back to Free. "Journey Pop-up Supper" was paid (F10), refunded (F11) and had a checkout abandoned (F12); it is now an unpublished draft with 2 registrations. Design Night's venue and time were edited and put back. Two tests that could not be fully shown in the text of the page (toasts) were judged from the page text caught within the 4 second window.

Not covered: A4 "Email me a sign-in code" was not exercised (sign-up with password logs straight in with no code or email step).

---

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

**Result:** PASS
**Comment:** Landed on Home showing "Free plan", "Good morning, Tom" and an unread badge (7) on the Home menu item.

- **A2** Try a wrong password. *Expect:* a clear error, no crash, not logged in.

**Result:** PASS
**Comment:** "Invalid email or password" shown on the login page; going to `/app` afterwards still sent me to login.

- **A3** Log out, then open `/app`. *Expect:* sent to the login page.

**Result:** PASS
**Comment:** Logging out then opening `/app` went to the login page.

- **A4** Sign up a brand-new account (any new `@demo.scanme.test` email). *Expect:* account created; if an emailed code or link is part of it, it appears in `.test-outbox/emails.jsonl` and works.

**Result:** PASS
**Comment:** Name, email and password created the account and went straight to Home with no email step, so nothing appeared in the email file. The new Home starts with "Sharing paused" and a short code, which is slightly surprising for a new user but not wrong. The "Email me a sign-in code" option was not tried.

## B. Profile and Modes
- **B1** As `basic@`, edit Profile (change role text), save. *Expect:* "Profile saved" and the change persists after a reload.

**Result:** PASS
**Comment:** The role change saved and was still there after reload. The confirmation is a toast that says "Changes saved" (not "Profile saved") and disappears after about 4 seconds. My first attempt missed it only because the script looked for the other wording.

- **B2** Open Modes as a Free user. *Expect:* Basic, Networking, Incognito can be chosen; Creator and Portfolio are clearly marked as Pro.

**Result:** PASS
**Comment:** "3 free, 2 Pro" heading; Basic, Networking and Incognito marked Free and Customise; Creator and Portfolio carry a clear Pro tag and offer Preview only.

- **B3** Switch the active Mode (Basic to Networking and back). *Expect:* the active label changes; the QR link stays the same.

**Result:** PASS
**Comment:** Home changed to "Sharing on Networking Mode" and back to Basic; the permanent code stayed the same. A sensible "make this your active Mode?" confirmation appears first.

- **B4** Open "Visitor preview" for the active Mode. *Expect:* shows what a visitor sees, matching the profile.

**Result:** PASS
**Comment:** Preview shows the name, bio and links from the profile with the question and a "Send privately (preview: not sent)" button. It is clearly labelled as preview only.

- **B5** As `creator@` open the Creator preview, and as `portfolio@` the Portfolio preview. *Expect:* each shows its own layout (links/projects).

**Result:** PASS
**Comment:** Creator shows a featured item, links (tour dates, merch, newsletter) and a poll. Portfolio shows project cards with "View project" and an enquiry form. Each is clearly different.

## C. A visitor scans a code and the owner's inbox
- **C1** Logged out, open `/t/b1b484e4c99c`, answer, and send a message. *Expect:* a "Sent privately" confirmation.

**Result:** PASS
**Comment:** Visitor page loaded, answer sent, and it said "Sent privately. Thanks for taking a moment to respond."

- **C2** As `basic@`, open the inbox on Home. *Expect:* the new response is at the top, marked New, labelled with the right Mode, unread count went up by one.

**Result:** PASS
**Comment:** New response was at the top, marked New, labelled Basic, and unread went from 7 to 8.

- **C3** Open that response. *Expect:* full text visible; it becomes read and the unread count drops.

**Result:** PASS
**Comment:** Opening shows the full answer in a pop-up. It is marked read when the pop-up is closed (by design), after which unread dropped from 8 to 7. Two early attempts failed only because my script did not close the pop-up.

- **C4** Archive a response, then find it under the Archived filter and restore it. *Expect:* it moves in and out correctly.

**Result:** PASS
**Comment:** Archived count went 2 to 3, the item was listed under Archived, and "Unarchive" returned it to the inbox (count back to 2).

- **C5** Use the filters (All, Unread, Archived, Blocked) and the Mode filter. *Expect:* each shows the right items, counts match.

**Result:** PASS
**Comment:** Row counts matched the badge numbers on every filter. Mode filter works (Basic showed 25 items, Networking showed none and displayed the "first response will land here" message, which is slightly misleading for a filter that is just empty).

- **C6** Block a visitor on a response. *Expect:* confirmation prompt first; it appears under Blocked afterwards.

**Result:** PASS
**Comment:** "Block this visitor? Their browser will not be able to send you anything else..." with Cancel / Block visitor. Nothing changed until confirmed; afterwards Blocked went 1 to 2 and the item was listed there.

- **C7** As a visitor open `/t/441dcfb8a9ab` (Incognito) and send a message; check as `incognito@`. *Expect:* arrives under Incognito, no identity details exposed.

**Result:** PASS
**Comment:** The visitor page is headed "ANONYMOUS" and the response arrived under Incognito as "Visitor 16E" with no name or email. The list preview only shows the first answer, so a rating shows as just "1", which is a little cryptic but harmless.

## D. Events: organiser side
- **D1** As `organiser@`, open Events. *Expect:* live, ended, upcoming and closed events listed with correct states.

**Result:** MINOR
**Comment:** All four events are listed with date, venue and number of tags, but there is no Live / Ended / Upcoming / Closed label. Every event shows only "Published", including the closed Old Meetup. Should fix soon: organisers cannot see at a glance which events are running or over.

- **D2** Open the live Summit. *Expect:* registered/checked-in/places-left numbers, the join link and access code, attendee list.

**Result:** PASS
**Comment:** Shows Registered 49, Places left 1, Cards complete 46, Checked in 15, the event page link with Copy, access code AJ5NE, and a searchable attendee list with check-in, personal link and remove buttons.

- **D3** Open Badges for an event. *Expect:* badge page and CSV download work.

**Result:** PASS
**Comment:** Print sheet shows tidy badges (name, role, tag, QR). The CSV downloaded with the right file name and 49 rows (tag, name, role, access code, join link).

- **D4** As `organiser2@`, create a new event with plain badge numbers. *Expect:* created as Draft, "not public", free to preview.

**Result:** PASS
**Comment:** Created (after clearing the roles box) as "Draft · not public" with 50 places, an access code and the "add people and preview badges first, free" message.

- **D5** As `organiser2@`, create an event leaving the roles box as it is. *Expect:* a clear "role letters are a Pro feature" message, nothing broken.

**Result:** MINOR
**Comment:** The message is clear ("Role letters on badges are a Pro feature. Clear the roles box to use plain numbers. See plans") and nothing broke. But the roles box is pre-filled with F=Founder, I=Investor... for Free users, so the default path always fails, and the form comes back empty so everything typed is lost. Should fix soon: leave the box empty for Free users, or keep what was typed.

- **D6** Use "Attendee view" on a draft event. *Expect:* preview of what attendees will see.

**Result:** FAIL
**Comment:** The button opens the public event page, which says "This event isn't open" for a draft, even for the logged-in owner. There is no preview. Should fix soon: organisers cannot see the attendee experience before paying to publish. Not a blocker for the first release because the rest still works.

- **D7** As `organiser@` change an event's details/reschedule. *Expect:* saves and shows the new details.

**Result:** PASS
**Comment:** Changed Design Night's venue and start time; "Changes saved", the settings and the event header showed the new details. I then put them back.

## E. Events: attendee side
- **E1** Logged out, open Summit, register with access code `AJ5NE` (choose a role, fill the required answers). *Expect:* "You are in", a badge tag is shown.

**Result:** PASS
**Comment:** "You are in. Your attendee tag: F-104", with a private personal link, an emailed copy and the edit deadline. This took the Summit's last place (now 50 of 50 and shows "This event is full" to newcomers).

- **E2** Try registering with a wrong access code. *Expect:* a clear error and what you typed is kept.

**Result:** PASS
**Comment:** "That access code does not match this event. It is on the poster or the welcome slide." Name, email and answers stayed filled in (checked on the Design Night form). The message sits at the bottom of a long form, so on a phone it could be missed.

- **E3** Open the Design Night join page (starts next week). *Expect:* registration works; networking features are not open yet.

**Result:** PASS
**Comment:** Registration worked (tag 016). The People page says "Finding people opens 4 Dec 2026, 00:21."

- **E4** As a registered attendee, open People, search by name, open a card, and Save a person. *Expect:* results, card, and the Saved list updates.

**Result:** PASS
**Comment:** People lists everyone sharing a card; searching "Leo Lopez" gave one result; the card showed the answers; "Save this person" added him to the Saved page.

- **E5** Send a message request to another attendee. *Expect:* "Request sent".

**Result:** PASS
**Comment:** "Request sent. They will see it in their Messages." for each of three requests.

- **E6** As that other attendee (second private window), accept it, reply, and read the reply back as the first. *Expect:* both sides see the whole conversation, tied to the event, with the close time shown.

**Result:** PASS
**Comment:** Leo accepted ("You can now message each other"), replied, and the first attendee saw the full two-message conversation. The close time ("Messages close 30 Nov 2026, 12:21, 48 hours after the event ends") is shown on the Messages page, not inside the conversation itself.

- **E7** Decline another request, and block a sender. *Expect:* declined/blocked clearly confirmed; blocked sender cannot message again.

**Result:** PASS
**Comment:** "Declined. They will not be told why." and "Blocked. You can no longer find or message each other at this event." After the block the sender could no longer even find the person in search.

- **E8** Open the Product Breakfast (ended 3 hours ago). *Expect:* existing conversations still reply; new requests are not allowed.

**Result:** PASS
**Comment:** Messages page says "The event has ended. You can reply in accepted conversations until 28 Nov 2026, 21:21; new requests are closed." A reply in an existing conversation was sent. On other people's cards the request box is simply absent (no explanation on the card itself).

- **E9** Open the Old Meetup (closed). *Expect:* "This event isn't open" with no join form.

**Result:** PASS
**Comment:** Both the event page and the join page say "This event isn't open" with no form.

- **E10** As `attendee@` open Events, Attending. *Expect:* the Summit conversations are kept read-only after the event.

**Result:** PASS
**Comment:** Attending lists the Summit with the tag; "Conversations" opens a read-only copy ("You can't send new messages here") with the full threads.

## F. Payments (Stripe test mode)
- **F1** As `newuser@` (Free), Profile, "Upgrade to Pro", pay with 4242. *Expect:* returns to Profile showing Pro (it may take a few seconds); database/plan says Pro because Stripe's verified message arrived.

**Result:** PASS
**Comment:** Stripe's page showed "Subscribe to ScanMe Pro (TEST), 9.00 GBP per month". After paying it returned to Profile showing "Pro account / Pro plan". The database plan was `pro` and the server log shows the signed Stripe messages accepted (200).

- **F2** As that Pro account, check Pro features. *Expect:* Creator and Portfolio Modes selectable; Photo QR download enabled.

**Result:** PASS
**Comment:** Creator and Portfolio were open with an enabled "Activate Mode". Photo QR passed 8 of 8 checks with Download PNG enabled.

- **F3** As `basic@` visit `/app/profile?pro=1` without paying. *Expect:* still Free; only a "confirming" note.

**Result:** PASS
**Comment:** Stayed Free; the note reads "Pro switches on as soon as Stripe confirms the payment; refresh in a moment."

- **F4** As `basic@` start the Pro checkout and pay with the declined card. *Expect:* "Your card was declined"; still Free.

**Result:** PASS
**Comment:** Stripe showed "Your card was declined. Try another payment method or card." and stayed on the payment page; `basic@` remained Free.

- **F5** As `basic@` start the Pro checkout and use the back arrow. *Expect:* returns to Profile; still Free; no charge.

**Result:** PASS
**Comment:** Back arrow returned to Profile, still Free.

- **F6** As `newuser@` (now Pro), click "Manage or cancel Pro". *Expect:* Stripe's billing page opens.

**Result:** PASS
**Comment:** Stripe's billing page opened showing the subscription, next billing date, card and a Cancel button. Its return link says "Return to BzzR Options" (the Stripe account name), not ScanMe.

- **F7** Cancel `newuser@`'s subscription (use Stripe's billing page, or the Stripe CLI/API). *Expect:* plan returns to Free shortly after.

**Result:** PASS
**Comment:** Cancelled through the Stripe API; the cancellation message arrived (200) and the plan returned to Free within seconds.

- **F8** Send a webhook with a wrong signature to `/api/stripe/webhook`. *Expect:* rejected (400); nothing changes.

**Result:** PASS
**Comment:** Returned 400 "bad signature".

- **F9** Re-send a genuine paid Stripe event after cancelling. *Expect:* accepted, but the account stays Free.

**Result:** PASS
**Comment:** The old paid event was accepted (200) and the account stayed Free; the server log says the subscription was cancelled so Pro was not activated.

- **F10** As `organiser2@`, open draft "Journey Pop-up Supper", choose "Up to 50 attendees", Pay and publish with 4242. *Expect:* returns to the event as Published, 50 places, the public page is open.

**Result:** PASS
**Comment:** Paid 29.00 GBP; returned to the event as Published with capacity 50 (49 left, one earlier registration was kept); the public page showed the join form.

- **F11** Register as an attendee on that event, then refund the payment in Stripe (CLI/API). *Expect:* the event returns to Draft, public page says "This event isn't open", the registration is kept.

**Result:** PASS
**Comment:** After the refund the event went back to Draft, the public page said "This event isn't open", and both registrations (including mine) were still listed.

- **F12** Start an event checkout, then abandon it (let it expire or expire it via Stripe). *Expect:* event is not published; the pending purchase ends as failed.

**Result:** PASS
**Comment:** After expiring the session the new purchase ended as failed and the public page stayed "isn't open". One older pending purchase from earlier test runs was still sitting as pending; harmless but worth a clean-up job. Internally the event status shows "awaiting_payment" rather than draft.

## G. Photo QR
- **G1** As `basic@` (Free), open Photo QR, choose a picture, pick Photo style. *Expect:* preview works, software check passes (e.g. 8 of 8), Download is disabled with an upgrade note.

**Result:** PASS
**Comment:** Preview showed, "Passed 8 of 8 tested conditions", Download PNG greyed out with "Downloading a Photo QR needs Pro. The Classic code downloads on any plan." and a Compare plans link. The photo-style QR looks like noise rather than a recognisable picture, with the sample image used.

- **G2** As `organiser@` (Pro), repeat. *Expect:* Download PNG is enabled.

**Result:** PASS
**Comment:** Same 8 of 8 result with Download PNG enabled.

- **G3** Use "Reset to standard QR". *Expect:* back to the standard code, same link.

**Result:** PASS
**Comment:** The page returned to "Your QR" standard code; the link (`/t/2708bcd8538e`) was identical before and after.

## H. Account, data and pages
- **H1** Open Settings, "download my data". *Expect:* a file downloads with the account's data.

**Result:** MINOR
**Comment:** A JSON file (`scanme-data-2026-11-27.json`) downloads with profile, codes, Modes, questions, responses and purchases; no passwords or payment keys. But each visitor response includes technical identifiers (a session token and device hash). Should fix soon: remove them, especially for Incognito visitors.

- **H2** On the **new account from A4 only**, delete the account. *Expect:* confirmation first, account removed, can no longer log in.

**Result:** PASS
**Comment:** You must type DELETE; typing something else was refused ("type DELETE in the box") and the account stayed. After typing DELETE the account was removed and logging in gave "Invalid email or password".

- **H3** Open Plans, How it works, and the legal pages. *Expect:* all load; Plans shows no Pro price (known and intended).

**Result:** FAIL
**Comment:** Plans and How it works load (Plans shows Pro as "Soon, price to be confirmed"). There are no legal pages: `/privacy` and `/terms` both show a 404 and the footer links to none. Blocker for launch with real users (privacy notice and terms are needed because the app collects emails and takes payments). Also, Plans says "Pro is not open yet" while Profile already sells Pro at 9.00 GBP a month.

- **H4** Open the Shop and register interest in an item. *Expect:* interest saved, clear confirmation.

**Result:** PASS
**Comment:** Pressing "I am interested" gave a confirmation and after reload the item says "You are on the list".

## I. Look and feel
- **I1** At phone width (390 px), open Home, Modes, Profile, Events, a public personal page, an event join page, Plans. *Expect:* nothing scrolls sideways, text readable, buttons reachable.

**Result:** MINOR
**Comment:** Six of seven pages fit perfectly. Plans scrolls sideways, and its header colour-theme button is cut off at the right edge. Should fix soon. The Home page on a phone looks good with a bottom navigation bar.

- **I2** Same pages at desktop width (1280 px). *Expect:* tidy layout.

**Result:** MINOR
**Comment:** All pages tidy with no sideways scroll, except the Plans page where the "Start free" button on the Free card overlaps the last bullet ("30 days of response history"). Can fix with the I1 work.

- **I3** Switch light/dark. *Expect:* both readable, setting remembered after reload.

**Result:** PASS
**Comment:** Dark and light are both readable and the light choice stayed after moving to another page and reloading.

- **I4** Note anything confusing, ugly or slow (more than about 5 seconds). *Expect:* list it with a severity.

**Result:** MINOR
**Comment:** Nothing slow: pages took about 2.5 seconds on a loaded machine. Confusing or untidy items: (1) Plans says Pro is not open but Pro can be bought (should fix before opening Pro); (2) event list lacks status labels (D1); (3) toasts vanish in about 4 seconds; (4) Stripe pages carry the name "BzzR Options"; (5) the Next.js development badge shows in the corner (development mode only, not a product issue); (6) server log warns the Stripe API version differs from the pinned one (technical, ignore for now); (7) a stray server error appeared in the log when one of my test scripts was cut off, not caused by a user action.

## J. Safety
- **J1** As `basic@` try to open another user's event admin page (an `organiser@` event URL). *Expect:* not found or refused, no data shown.

**Result:** PASS
**Comment:** Showed "Wrong turn 404" with no event data, including on the attendees tab.

- **J2** Logged out, try `/app/events`, `/app/profile`. *Expect:* sent to login.

**Result:** PASS
**Comment:** Both redirected to the login page.

- **J3** As a visitor, try another organiser's draft event URL. *Expect:* "This event isn't open".

**Result:** PASS
**Comment:** `/e/demo-supper-club-3fe33d` said "This event isn't open".
