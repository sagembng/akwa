# Akwa

Water refill, container swap and station pickup requests for customers, with an order board for admins.

```bash
npm install
npm run dev
```

This starts the site on http://localhost:5173 and the API on http://localhost:8787.

## Database

With no configuration, the app uses an embedded Postgres stored in `.data/`, so it runs straight away. To use [Neon](https://neon.com), copy `.env.example` to `.env`, paste your connection string as `DATABASE_URL`, and restart. Tables and the admin account are created at startup.

## Deployment

Akwa runs as one Node process that serves both the built site and the API, so it fits any host that runs Node.

1. Push the repository to GitHub.
2. Create a Postgres database ([Neon](https://neon.com) or [Supabase](https://supabase.com)) and copy its connection string.
3. Create a web service on a Node host such as [Render](https://render.com) with these commands. The build step needs the dev dependencies, so keep `--include=dev` when `NODE_ENV=production` is set:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm install --include=dev && npm run build` |
   | Start command | `npm start` |

4. Set these environment variables on the host (never commit them):

   | Variable | Purpose |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Postgres connection string |
   | `ADMIN_MAGINHAWA_PASSWORD`, `ADMIN_KAPITOLYO_PASSWORD`, `ADMIN_POBLACION_PASSWORD` | One password per branch admin |
   | `PORT` | Set by most hosts automatically |

5. Open the site, then log in as each branch admin to confirm the passwords work.

The server logs a warning at startup if a branch admin still uses the public default password. Free hosting plans may sleep when idle, so the first visit can be slow.

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

  Emails and the default password are in `server/config.ts`. Anyone who can read this repository can see them, so set `ADMIN_MAGINHAWA_PASSWORD`, `ADMIN_KAPITOLYO_PASSWORD` and `ADMIN_POBLACION_PASSWORD` so each branch has its own password (`ADMIN_PASSWORD` is a shared fallback; `ADMIN_<BRANCH>_EMAIL` changes the emails) on a public deployment. Any older single admin account is removed at startup.

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

## Credits

Built by Xavier Imbang with the help of [Claude](https://claude.com/claude-code) by Anthropic, an AI coding assistant.
