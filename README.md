# Akwa

Water refill, container swap and station pickup requests for customers, with an order board for admins.

```bash
npm install
npm run dev
```

This starts the site on http://localhost:5173 and the API on http://localhost:8787.

## Database

With no configuration, the app uses an embedded Postgres stored in `.data/`, so it runs straight away. To use [Neon](https://neon.com), copy `.env.example` to `.env`, paste your connection string as `DATABASE_URL`, and restart. Tables and the admin account are created at startup.

## Tests

```bash
npm test
```

The API tests run real SQL on the embedded database. To run them on another Postgres, set `TEST_DATABASE_URL` to a throwaway database, because they delete every order.

## Accounts

- **Customers** register in the app. Passwords need at least 10 characters with upper and lower case letters, a number and a symbol.
- **Demo customer** is a hardcoded account for trying the app: `demo@akwa.example` / `AkwaDemo2026!`. The login page has a button for it. Set `DEMO_EMAIL` and `DEMO_PASSWORD` to change it.
- **Admins** are three hardcoded accounts, one per branch, all with the password `AkwaAdmin2026!`. A branch admin sees and handles only that branch's orders:

  | Branch | Email |
  | --- | --- |
  | Akwa Maginhawa | `admin.maginhawa@akwa.example` |
  | Akwa Kapitolyo | `admin.kapitolyo@akwa.example` |
  | Akwa Poblacion | `admin.poblacion@akwa.example` |

  Emails and the shared password are in `server/config.ts`. Anyone who can read this repository can see them, so set `ADMIN_PASSWORD` (and the `ADMIN_<BRANCH>_EMAIL` variables) on a public deployment. Any older single admin account is removed at startup.

## Delivery fee

Every order is served by a branch. For container swaps and refill deliveries the fee depends on the straight-line distance from that branch to the centre of your city (the app has no address geocoder, so city centres are approximate):

| Distance from branch | Fee |
| --- | --- |
| up to 3 km | ₱20 |
| up to 6 km | ₱40 |
| up to 10 km | ₱60 |
| up to 15 km | ₱80 |
| over 15 km | ₱100 |

Pickup has no fee. Tiers and city centres are in `src/data.ts`, and the server always recomputes the fee.

## Mock payments

No money moves. **GCash and Maya** show a sample QR code (`public/qr/`, from `Branding/Assets`). The customer sends the amount, then attaches a screenshot of the receipt. The order is placed with the payment *awaiting verification*, and the branch admin opens the receipt on the order board and verifies or rejects it. An order paid this way cannot be confirmed until its payment is verified; after a rejection the customer attaches a new receipt from My orders. Receipts are stored in the database and only the customer and that branch's admin can open them.

**Cards** accept only two test numbers: `4242 4242 4242 4242` pays and `4000 0000 0000 0002` declines. Only the last 4 digits reach the server. Cancelling a paid order refunds it, and cash is marked paid when an admin marks the order delivered.

## Forms

Mobile numbers must be exactly 11 digits starting with `09` (`+63` is accepted and converted). Delivery addresses are split into house or unit number, street, barangay and city. Entering an address while registering saves it, and booking fills it in.

## Scope

Akwa is a portfolio demo: no water is delivered and no money moves, so use made-up details. It has no email sending, so there is no email confirmation or password reset. Prices and branches are sample data in `src/data.ts`, and the same file is used by the browser and the server. The maps use Google's keyless embed, which shows one pin per map. A Maps API key would allow every branch on one map.
