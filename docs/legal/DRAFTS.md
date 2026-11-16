# ScanMe legal documents — DRAFT, NOT REVIEWED

> **Status: DRAFT — NOT REVIEWED BY A LAWYER. Not published, not binding.**
> Written from what the product actually does on 2026-11-16, so a reviewer starts from facts.
> Everything in [square brackets] is an open decision. Do not publish any part of this
> until a qualified UK lawyer has reviewed it and the open decisions below are made.

Open decisions this depends on:
- **D4** prices: Pro subscription and event packages (placeholders in the app).
- **D5** retention: how long closed-event data is kept before deletion (the deletion job does nothing until set).
- **D6** lawful basis for keeping read-only event history for permanent accounts (feature built switched off).
- **D7** refunds and credits.
- **D8** VAT and fees.
- Company name, registered address, ICO registration number, contact email.

---

## 1. Privacy notice

**Who we are.** [Company name], [address], ICO registration [number]. Contact: [email].

**What we collect and why.**

| Data | From whom | Why | Lawful basis (UK GDPR) |
|---|---|---|---|
| Name, email, password hash, sign-in records | Account holders | Run your account | Contract |
| Profile details you choose to add (role, links, bio, photo link) | Account holders | Show them on the Mode you pick | Contract |
| Responses visitors send you (ratings, text, optional contact) | Visitors | Deliver them to you | Legitimate interests (the visitor chooses to send) |
| Visit and link-click counts, a hashed visitor device id | Visitors | Your analytics; stop spam | Legitimate interests |
| Attendee name, optional email, event card answers, tag number, check-in time | Attendees, or the organiser who registers them | Run the event | Organiser is controller; ScanMe is processor (see DPA) |
| Saved people, message requests and messages between attendees | Attendees | Event networking | Contract with the attendee [to confirm] |
| Search log (who looked up which badge number, and misses) | Attendees | Stop badge numbers being harvested | Legitimate interests |
| Abuse reports | Attendees | Safety | Legitimate interests / legal obligation |
| Payment records (amount, package, Stripe session id). Card details never reach us. | Organisers | Take payment, accounting | Contract, legal obligation |

**Who sees what.** Organisers never see attendee messages, saved lists or reports. Attendees choose whether their card is shown in full, name only, or hidden. Visitors never see an account holder's email unless a Mode shows it.

**Processors.** Neon (database, [region]), Netlify (hosting), Resend (email), Stripe (payments), Google (only if you choose Google sign-in).

**How long we keep it.** Accounts: until you delete them. Event data: attendee access closes 48 hours after the event; data is deleted [D5: N days] after that. Payment records: [6 years, HMRC — confirm].

**Your rights.** Access, correction, deletion, objection, portability, complaint to the ICO. Account holders can download their data and delete their account in Profile. Attendees can remove their card on the event page.

## 2. Terms of use (account holders and visitors)

- You must be [13/16/18 — decide] or older.
- You are responsible for what your Modes ask and show. Follow the acceptable use policy (section 6).
- Free plan: [limits as shown on the Plans page]. Pro: [D4 price], billed [monthly/yearly], cancel any time; [D7 refunds].
- We may suspend accounts that break these terms. [Notice and appeal process.]
- Liability: [standard UK consumer-safe wording; reviewer to supply].

## 3. Organiser terms

- Events start as free drafts. Publishing requires buying a package; capacity is set by the package and enforced by the database.
- The organiser is the **controller** of attendee data they upload or collect; ScanMe is the **processor** (section 7).
- The organiser must have a lawful basis to upload attendee names and emails, and tell attendees about ScanMe.
- Cancelling an event: [D7: credit or refund rules].
- Organisers cannot read attendee messages. Reports go to ScanMe.
- VAT: [D8].

## 4. Cookies

Strictly necessary only:
- Sign-in session cookie (Better Auth), 14 days.
- Attendee cookie (`sm_att_…`), signed, expires when the event's access window closes.
- Theme preference (stored in the browser).
No advertising or analytics cookies, so no consent banner is needed [confirm with reviewer].

## 5. Retention schedule

| Data | Kept until |
|---|---|
| Account and profile | Account deletion |
| Personal responses | Free plan: shown for 30 days, kept [decide]; Pro: [decide] |
| Event attendee data, messages, saved lists, search log | Access closes 48h after the end; deleted [D5] days later |
| Abuse reports | [decide, e.g. 12 months] |
| Payment records | [6 years] |
| Audit log (organiser actions) | Same as the event |

## 6. Acceptable use

No harassment, spam, impersonation, illegal content, collecting people's data for unrelated purposes, scraping badge numbers, or using messaging to sell. Messaging is for people at the same event. Reports are reviewed by ScanMe [response time].

**Online Safety Act:** event messaging is user-to-user content. A risk assessment and reporting process are needed before launch [reviewer].

## 7. Data processing agreement (organiser ↔ ScanMe)

- Subject matter: running the organiser's event (registration, badges, attendee cards, networking).
- Data: attendee names, optional emails, card answers, tags, check-in times.
- ScanMe processes only on the organiser's instructions (the settings they choose), keeps data confidential, uses the processors listed in section 1, assists with data subject requests, deletes data at the end of retention [D5], and notifies breaches without undue delay.
- Security: row-level security in the database, separate restricted database roles, access tokens stored only as hashes, rate limits.
- International transfers: [confirm processor regions and safeguards].
