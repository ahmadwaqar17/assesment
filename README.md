# Toll Recovery for 1Now

## The problem

When a renter drives through a toll, the agency (E-ZPass, for example) reads the license plate and bills
the car's registered owner: the operator. The bill arrives days or weeks later, as one statement for the
whole fleet. On Turo, the host submits those tolls to Turo and gets reimbursed. An operator who rents
directly through 1Now has no Turo in the middle, so for every line on the statement they have to work out
*"Who had this car at 3:42pm last Tuesday?"*, charge that renter's card, and keep proof in case the
renter disputes it.

Small operators do this by hand in a spreadsheet, or give up and pay the tolls themselves. A busy car can
easily run up $50–150 in tolls a month. 1Now's own comparison page rates its toll capture and billing as
"partial / in rollout", so this is a real gap.

## What Toll Recovery does

The operator uploads a toll statement. The app works out who owes each toll and lets the operator charge it
in one click, but only after they say yes.

It sits inside a demo operator dashboard for one business, "Sunset Rentals", rather than standing alone:

- **Dashboard**: Carisma, the assistant, lists what needs the operator ("5 toll charges ready for your OK ·
  $71.33", "3 tolls need your call"), each with a button that goes straight there. Below are the totals
  recovered from renters, waiting for approval, to file with Turo, and absorbed by the operator.
- **Bookings**: every trip shows its toll status: Paid, Ready to charge, Waiting on renter, Failed, File with
  Turo, or tolls still to review. Each one has a receipt or next step.
- **Fleet**: tolls per car, split into recovered, still owed, to file with Turo, in review, and absorbed.
  Absorbed tolls are a real cost on that car.
- **Tolls**: the workflow itself, in three steps: Upload, Results and Approve.
- **Settings → Tolls**: the default statement timezone, the review buffer, and the admin fee.

Customers, Calendar, Payouts and Carisma's own page appear in the sidebar but are disabled and labelled
"Not in demo".

The toll workflow:

- **Upload** a CSV statement and pick its timezone. If any row is bad, nothing is imported and every
  problem is listed with its row number.
- **Match**: every toll lands in exactly one bucket, with a plain-English reason:
  **Charge renter**, **Needs review**, **Turo reimbursement**, **Operator expense** or **Duplicate**.
- **Review**: anything unclear goes to a person. They see why the toll is unclear and which trips it
  could belong to, then pick a trip or mark it as an operator expense. The row moves to the right tab
  straight away, and the app records that a person made the call.
- **Approve**: one card per trip, asked before anything happens:
  *"Sarah Mitchell · Toyota RAV4 2022 · 3 tolls · $29.32. Charge saved card?"* with **Charge** and **Skip**.
- **Result**: each charge shows **Paid**, **Waiting on renter** (with a payment link to copy and send),
  or **Failed** (with the reason).
- **Receipt**: an itemized, printable receipt per charge. It lists the trip, car, renter, each toll
  (local time, plaza, amount), the total and the payment reference. It's the operator's proof if the
  renter disputes a charge.

The key rule: **a renter is only charged automatically when the toll falls strictly inside their trip.**
Anything in a grey zone goes to a person. Wrongly charging a renter costs the operator a customer, which
is worse than a few seconds of review.

![Screenshot: toll results with the five buckets](docs/screenshot.png)
<!-- Screenshot placeholder: add docs/screenshot.png -->

## Run it

Requires **Node 22.12 or newer**.

```bash
npm install        # from the repo root (installs web/) or inside web/
npm run dev        # http://localhost:5173, with seed trips and the fake payment gateway
```

```bash
npm test           # 171 tests: domain rules, the sample-statement acceptance test, state, and the UI
npm run build      # type-check and production build
npm run lint
```

No accounts, keys or setup are needed. Payments go through a built-in fake gateway that behaves like
Stripe test cards. Data lives in your browser. **Reset demo**, in the yellow demo bar at the top of every
page, restores the seed data.

## Demo walkthrough

1. **Upload**: on the Dashboard, Carisma asks for a statement. Click **Upload statement**, then **Use
   sample statement**, or drop in `web/public/sample-tolls.csv`. You land on the results.
2. **See the buckets**: Charge renter $71.33 (7), Needs review $23.52 (3), Turo reimbursement $9.10,
   Operator expense $13.38, Duplicate $17.63. Every row shows its reason. For example, TX-1003 at
   10:10 AM goes to James, because Sarah handed the car over at 10:00.
3. **Review the three grey-zone tolls**: give the exact-handover toll (Oct 4, 10:00 AM) to Sarah, give
   the toll 20 minutes after Lisa's late return to Lisa, and mark the toll 10 minutes before Lisa's
   pickup as an operator expense. The tabs and totals update immediately.
4. **Approve**: charge Sarah (**Paid**), Omar (**Waiting on renter**, copy the payment link) and Daniel
   (**Failed: Your card was declined.**). Back on the Dashboard, Carisma now reports the renter who still
   has to confirm and the failed charge. **Bookings** and **Fleet** show where every toll stands.
5. **Try to double-charge**: double-click **Charge** on James. Only one charge is made, and his tolls
   can't be charged again.
6. **Receipt and re-upload**: open Sarah's receipt and print it. Then upload the same sample again:
   every row is a **Duplicate**.

## How matching works, in plain words

For each toll on the statement:

1. **Have we seen it before?** A toll is identified by its transaction id or, if there isn't one, by
   plate + time + plaza + amount. If it appeared earlier in this file or in any earlier upload, it's a
   **Duplicate** and is ignored.
2. **Same car?** Plates are compared after uppercasing and stripping spaces and dashes, so
   `flx 4821`, `FLX-4821` and `FLX4821` are the same car.
3. **Exactly one trip had the car** (pickup ≤ toll time ≤ return, both ends included): charge that
   renter if it was a direct booking, or list it as a **Turo reimbursement** if it was a Turo trip. A
   late return counts: the trip runs until the car actually came back.
4. **Two trips had the car at that moment** (the exact handover minute, or overlapping bookings, which is
   a data error): **Needs review**, with both trips offered.
5. **No trip had the car, but one was within 30 minutes** of pickup or return: **Needs review**, with the
   nearest trip suggested.
6. **Nobody had the car**: **Operator expense**.

Toll times on the statement are local time without an offset, so the app reads them in the timezone the
operator picks, then compares everything in UTC. For example, 11:45 PM EDT is 3:45 AM UTC the next day.

**Charges** group the chargeable tolls by trip. Money is integer cents throughout. An optional admin fee
per toll can be set in Settings; the app notes that it must be disclosed in the rental agreement. Each charge
carries an **idempotency key** made from the trip and the exact set of tolls. The same tolls always
produce the same key, so a double click, a retry or a page reload mid-charge can never charge the
renter twice. Separately, a toll that is already on a charge can never be put on another.

## What I cut, and why

| Cut | Why |
|---|---|
| Login and multi-operator accounts | 1Now said to skip auth. The demo has one operator ("Sunset Rentals"). |
| The rest of the operator app | Customers, Calendar, Payouts and Carisma's own page are shown in the sidebar for context but are disabled. Bookings and Fleet only show toll information. |
| Live toll agency feeds (E-ZPass and others) | They need account-level agency access. A CSV upload stands in. |
| Real Turo sync and filing Turo reimbursements | Turo has no public host API. Turo tolls are listed so the operator can file them. |
| A real database and backend | Browser storage is enough to demo the flow. The domain code is pure TypeScript with no React, so it can move to a backend unchanged. |
| Real email receipts | The receipt is a page the operator can print or share. |
| Disputes and refunds after charging | A separate feature; the receipt is the first step toward it. |
| Deployment | Runs locally with one command. |
| Real Stripe payments | The `PaymentGateway` interface is in place, with a deterministic fake behind it. A Stripe test-mode server was planned as an optional step and isn't built. |
| Retrying a failed charge | A failed charge stays failed. Reusing the same idempotency key would only replay the decline. A real retry needs the renter to add a new card first. |
| Completing "Waiting on renter" | The payment link is fake, so these charges don't turn into Paid in the demo. With Stripe, a webhook would do that. |

## What's next

- The same flow for other post-trip charges: fuel, extra miles, late return, cleaning, and the security
  deposit decision.
- Live toll feeds, so tolls arrive automatically instead of by upload.
- Auto-filing Turo reimbursements before Turo's deadline.
- A Carisma rule like "auto-charge tolls under $10 on verified renters". It would still ask first for
  anything in review.

## Code map

```
web/src/
  domain/      pure TypeScript, no React: plate, money, statement (CSV), matcher (rules), charges
  data/        seed trips and the demo operator
  payments/    PaymentGateway interface and FakeGateway
  state/       reducer, localStorage persistence, charge flow, summaries for dashboard/bookings/fleet
  components/  sidebar, review panel, charge card, display formatting
  pages/       Dashboard, Bookings, Fleet, Settings, Tolls (Upload, Results, Approve), Receipt
```
