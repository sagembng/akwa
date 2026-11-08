import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  canChange,
  deliveryFee,
  fromIso,
  formatAddress,
  hasAnyAddress,
  isClosed,
  isValidPhone,
  isWallet,
  manilaNow,
  MAX_GALLONS,
  MAX_PROOF_CHARS,
  REWARD_EVERY,
  WATER_TYPES,
  nextStatus,
  normalizePhone,
  PHONE_HELP,
  previousStatus,
  SERVICES,
  slotsFor,
  stationById,
  upcomingDays,
  validateAddress,
  validateRegistration,
  type AddressFields,
  type WaterType,
  unitPrice,
  whereOf,
  addDays,
  toIso,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceId,
  type SlotOrder,
} from '../src/data';
import type { Db, Queryable } from './db';
import { SESSION_COOKIE, SESSION_DAYS } from './config';
import { hashPassword, hashToken, makeRef, newSessionToken, verifyPassword } from './security';

class ApiError extends Error {
  constructor(public status: 400 | 401 | 402 | 403 | 404 | 409 | 415, public code: string, message: string, public field?: string) {
    super(message);
  }
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  /** Set for admins: the only branch whose orders they can see. */
  branchId: string | null;
}

type Env = { Variables: { user: User | null } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_COLUMNS = 'u.id, u.name, u.email, u.phone, u.role, u.branch_id AS "branchId"';
const ORDER_SELECT = `
  SELECT o.id, o.ref, o.user_id, o.service, o.gallons, o.water_type, o.free_gallon, o.station_id, o.date::text AS date, o.start_hour,
         o.name, o.phone, o.address, o.note, o.status, o.total,
         (extract(epoch FROM o.created_at) * 1000)::float8 AS created_at,
         p.method AS payment_method, p.status AS payment_status, p.reference AS payment_reference, p.last4 AS payment_last4, (p.proof IS NOT NULL) AS payment_has_proof
  FROM orders o JOIN payments p ON p.order_id = o.id`;

const toOrder = (r: any): Order => ({
  id: r.id,
  ref: r.ref,
  userId: r.user_id,
  service: r.service,
  gallons: r.gallons,
  waterType: r.water_type,
  freeGallon: r.free_gallon || undefined,
  stationId: r.station_id ?? undefined,
  date: r.date,
  start: r.start_hour,
  name: r.name,
  phone: r.phone,
  address: r.address ?? undefined,
  note: r.note ?? undefined,
  status: r.status,
  total: r.total,
  createdAt: Number(r.created_at),
  payment: {
    method: r.payment_method,
    status: r.payment_status,
    reference: r.payment_reference,
    last4: r.payment_last4 ?? undefined,
    hasProof: r.payment_has_proof || undefined,
  },
});

const asText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Stops two requests taking the last spot in a window. Held until the transaction ends. */
const lockWindow = (q: Queryable, where: string, date: string, start: number) =>
  q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${where}|${date}|${start}`]);

const toSlotOrder = (r: any): SlotOrder => ({ id: r.id, service: r.service, stationId: r.station_id ?? undefined, date: r.date, start: r.start_hour, status: r.status });

async function assertWindowOpen(q: Queryable, where: string, date: string, start: number, now: Date, excludeId?: string) {
  const rows = await q.query(`SELECT id, service, station_id, date::text AS date, start_hour, status FROM orders WHERE date = $1::date`, [date]);
  const slot = slotsFor(where, date, now, rows.map(toSlotOrder), excludeId).find((s) => s.start === start);
  if (slot?.state !== 'open') throw new ApiError(409, 'window_unavailable', 'That window just closed or filled up. Pick another one.');
}

const ADDRESS_KEYS = ['house', 'street', 'barangay', 'city'] as const;
const readAddress = (body: any): AddressFields => ({
  house: asText(body?.house, 40),
  street: asText(body?.street, 100),
  barangay: asText(body?.barangay, 80),
  city: asText(body?.city, 60),
});

/** A proof of payment is a small screenshot sent as a data URL. Anything else is refused. */
function readProof(value: unknown): string {
  if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
    throw new ApiError(400, 'proof_required', 'Attach a screenshot of your payment (PNG, JPG or WebP).', 'proof');
  }
  if (value.length > MAX_PROOF_CHARS) throw new ApiError(400, 'proof_too_large', 'That image is too large. Attach a smaller screenshot.', 'proof');
  return value;
}

/**
 * The mock gateway. Nothing leaves this function. Cards accept only known test numbers.
 * GCash and Maya are paid by scanning the shop's QR code, so they need a proof screenshot
 * and wait for the branch admin to verify it.
 */
function chargeMock(input: any): { method: PaymentMethod; status: PaymentStatus; last4?: string; proof?: string } {
  const method = input?.method as PaymentMethod;
  if (method === 'cash') return { method, status: 'pending' };
  if (isWallet(method)) return { method, status: 'review', proof: readProof(input.proof) };
  if (method === 'card') {
    if (input.last4 === '4242') return { method, status: 'paid', last4: '4242' };
    if (input.last4 === '0002') throw new ApiError(402, 'payment_declined', 'The test card was declined. Try again or choose another method.');
    throw new ApiError(400, 'test_cards_only', 'Only the listed test cards are accepted.');
  }
  throw new ApiError(400, 'invalid_payment', 'Choose a payment method.');
}

/** How a status change moves the money. */
async function applyPaymentEffects(q: Queryable, orderId: string, from: OrderStatus, to: OrderStatus) {
  const [payment] = await q.query<{ method: PaymentMethod; status: PaymentStatus }>('SELECT method, status FROM payments WHERE order_id = $1', [orderId]);
  let next = payment.status;
  if (to === 'cancelled') next = payment.status === 'paid' ? 'refunded' : 'void';
  else if (isWallet(payment.method) && from === 'cancelled' && payment.status === 'void') next = 'review';
  else if (payment.method === 'cash' && to === 'delivered') next = 'paid';
  else if (payment.method === 'cash' && (from === 'delivered' || from === 'cancelled')) next = 'pending';
  if (next !== payment.status) await q.query('UPDATE payments SET status = $1, updated_at = now() WHERE order_id = $2', [next, orderId]);
}

async function setStatus(q: Queryable, orderId: string, from: OrderStatus, to: OrderStatus, actorId: string) {
  await q.query('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2', [to, orderId]);
  await q.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [orderId, to, actorId]);
  await applyPaymentEffects(q, orderId, from, to);
}

export function createApp(db: Db, options: { now?: () => Date; secureCookies?: boolean } = {}) {
  const now = options.now ?? manilaNow;
  const app = new Hono<Env>();

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message, field: error.field } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again.' } }, 500);
  });

  app.use('/api/*', async (c, next) => {
    // SameSite=Lax blocks cross-site cookies, and JSON-only writes block plain form posts.
    if (c.req.method !== 'GET' && !c.req.header('content-type')?.includes('application/json')) {
      throw new ApiError(415, 'json_required', 'Send JSON.');
    }
    let user: User | null = null;
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const [row] = await db.query<User>(
        `SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)],
      );
      user = row ?? null;
    }
    c.set('user', user);
    await next();
  });

  const requireUser = (c: Context<Env>) => {
    const user = c.get('user');
    if (!user) throw new ApiError(401, 'not_logged_in', 'Log in to continue.');
    return user;
  };

  const requireAdmin = (c: Context<Env>) => {
    const user = requireUser(c);
    if (user.role !== 'admin') throw new ApiError(403, 'admin_only', 'Only admins can do that.');
    return user;
  };

  const startSession = async (c: Context<Env>, userId: string) => {
    const token = newSessionToken();
    await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [hashToken(token), userId]);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: options.secureCookies ?? process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_DAYS * 86400,
    });
  };

  const account = async (user: User | null) => {
    if (!user) return { user: null, details: null };
    const [details] = await db.query<AddressFields>('SELECT house, street, barangay, city FROM saved_details WHERE user_id = $1', [user.id]);
    return { user, details: details ?? null };
  };

  /* ---------- Accounts ---------- */

  const saveAddress = (q: Queryable, userId: string, a: AddressFields) =>
    q.query(
      `INSERT INTO saved_details (user_id, address, city, house, street, barangay) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET address = EXCLUDED.address, city = EXCLUDED.city, house = EXCLUDED.house, street = EXCLUDED.street, barangay = EXCLUDED.barangay`,
      [userId, formatAddress(a), a.city, a.house, a.street, a.barangay],
    );

  app.get('/api/me', async (c) => c.json(await account(c.get('user'))));

  app.post('/api/auth/register', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const input = {
      name: asText(body.name, 120),
      email: asText(body.email, 200).toLowerCase(),
      phone: asText(body.phone, 30),
      password: typeof body.password === 'string' ? body.password.slice(0, 200) : '',
      privacyAccepted: body.privacyAccepted === true,
      address: readAddress(body.address),
    };
    const errors = validateRegistration(input, input.password);
    const [field] = Object.keys(errors) as (keyof typeof errors)[];
    if (field) throw new ApiError(400, 'invalid_input', errors[field]!, field);

    const [user] = await db.query<User>(
      `INSERT INTO users (name, email, phone, password_hash, privacy_accepted_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (email) DO NOTHING RETURNING id, name, email, phone, role, branch_id AS "branchId"`,
      [input.name, input.email, normalizePhone(input.phone), await hashPassword(input.password)],
    );
    if (!user) throw new ApiError(409, 'email_taken', 'That email already has an account. Log in instead.', 'email');
    // An address given at sign-up becomes the saved delivery address, so booking fills itself in.
    if (hasAnyAddress(input.address)) await saveAddress(db, user.id, input.address);
    await startSession(c, user.id);
    return c.json(await account(user), 201);
  });

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = asText(body.email, 200).toLowerCase();
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const [row] = await db.query<User & { password_hash: string }>(`SELECT ${USER_COLUMNS}, u.password_hash FROM users u WHERE u.email = $1`, [email]);
    if (!email) throw new ApiError(400, 'invalid_input', 'Enter your email.', 'email');
    if (!password) throw new ApiError(400, 'invalid_input', 'Enter your password.', 'password');
    if (!row) throw new ApiError(401, 'email_not_found', 'No account uses this email. Check the spelling or create an account.', 'email');
    if (!(await verifyPassword(password, row.password_hash))) {
      throw new ApiError(401, 'wrong_password', 'Wrong password for this email. Try again.', 'password');
    }
    await startSession(c, row.id);
    const { password_hash: _hidden, ...user } = row;
    return c.json(await account(user));
  });

  app.post('/api/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  /* ---------- Availability ---------- */

  app.get('/api/availability', async (c) => {
    const where = c.req.query('where') ?? 'route';
    if (where !== 'route' && !stationById(where)) throw new ApiError(400, 'invalid_place', 'Unknown branch.');
    const current = now();
    const rows = await db.query(
      `SELECT id, service, station_id, date::text AS date, start_hour, status FROM orders WHERE date >= $1::date AND date <= $2::date`,
      [toIso(current), toIso(addDays(current, 14))],
    );
    const orders = rows.map(toSlotOrder);
    const user = c.get('user');
    // Only your own order frees up its spot when you are moving it.
    const exclude = c.req.query('exclude');
    let excludeId: string | undefined;
    if (user && exclude && UUID.test(exclude)) {
      const [own] = await db.query('SELECT id FROM orders WHERE id = $1 AND user_id = $2', [exclude, user.id]);
      excludeId = own?.id;
    }
    const days = Object.fromEntries(upcomingDays(current).map((date) => [date, slotsFor(where, date, current, orders, excludeId)]));
    return c.json({ days });
  });

  /* ---------- Orders ---------- */

  app.get('/api/orders', async (c) => {
    const user = requireUser(c);
    const rows = user.role === 'admin'
      ? await db.query(`${ORDER_SELECT} WHERE o.station_id = $1 ORDER BY o.date, o.start_hour`, [user.branchId])
      : await db.query(`${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.date, o.start_hour`, [user.id]);
    return c.json({ orders: rows.map(toOrder) });
  });

  const findOrder = async (q: Queryable, id: string, user: User) => {
    if (!UUID.test(id)) throw new ApiError(404, 'not_found', 'We can not find that order.');
    const rows = user.role === 'admin'
      ? await q.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.station_id = $2 FOR UPDATE OF o`, [id, user.branchId])
      : await q.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.user_id = $2 FOR UPDATE OF o`, [id, user.id]);
    if (!rows[0]) throw new ApiError(404, 'not_found', 'We can not find that order.');
    return toOrder(rows[0]);
  };

  app.post('/api/orders', async (c) => {
    const user = requireUser(c);
    if (user.role !== 'customer') throw new ApiError(403, 'customers_only', 'Only customers can place orders.');
    const body = await c.req.json().catch(() => ({}));

    const service = body.service as ServiceId;
    if (!SERVICES.some((s) => s.id === service)) throw new ApiError(400, 'invalid_input', 'Choose a service.');
    const gallons = Number(body.gallons);
    if (!Number.isInteger(gallons) || gallons < 1 || gallons > MAX_GALLONS) throw new ApiError(400, 'invalid_input', `Choose 1 to ${MAX_GALLONS} gallons.`);
    const waterType = (asText(body.waterType, 20) || 'purified') as WaterType;
    if (!WATER_TYPES.some((w) => w.id === waterType)) throw new ApiError(400, 'invalid_input', 'Choose a type of water.', 'waterType');
    const isPickup = service === 'pickup';
    // Every order is handled by a branch. For deliveries it sets the distance, and so the fee.
    const stationId = asText(body.stationId, 40);
    if (!stationById(stationId)) throw new ApiError(400, 'invalid_input', 'Choose a branch.');

    const date = asText(body.date, 10);
    const start = Number(body.start);
    if (!upcomingDays(now()).includes(date) || !Number.isInteger(start)) throw new ApiError(409, 'window_unavailable', 'That window just closed or filled up. Pick another one.');

    const name = asText(body.name, 120);
    if (!name) throw new ApiError(400, 'invalid_input', 'Enter your name so we know who to ask for.', 'name');
    const phone = asText(body.phone, 30);
    if (!isValidPhone(phone)) throw new ApiError(400, 'invalid_input', PHONE_HELP, 'phone');
    const address = readAddress(isPickup ? {} : body);
    if (!isPickup) {
      const problems = validateAddress(address);
      const bad = ADDRESS_KEYS.find((k) => problems[k]);
      if (bad) throw new ApiError(400, 'invalid_input', problems[bad]!, bad);
    }
    const city = address.city;
    const note = isPickup ? '' : asText(body.note, 300);

    // Prices always come from the server, whatever the browser sends.
    const pricePerGallon = unitPrice(service, waterType);
    const fee = deliveryFee(service, stationId, city);
    const baseTotal = pricePerGallon * gallons + fee;
    const where = whereOf(service, stationId);

    const id = await db.tx(async (q) => {
      await lockWindow(q, where, date, start);
      await assertWindowOpen(q, where, date, start, now());
      // Every ${REWARD_EVERY} completed orders earn one free gallon, taken off this order automatically.
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reward|${user.id}`]);
      const [counts] = await q.query<{ completed: number; used: number }>(
        `SELECT count(*) FILTER (WHERE status = 'delivered')::int AS completed,
                count(*) FILTER (WHERE free_gallon AND status <> 'cancelled')::int AS used
         FROM orders WHERE user_id = $1`,
        [user.id],
      );
      const freeGallon = Math.floor(counts.completed / REWARD_EVERY) - counts.used > 0;
      const orderTotal = baseTotal - (freeGallon ? pricePerGallon : 0);
      // Nothing left to pay (a free single gallon at pickup), so there is no payment step.
      const payment: ReturnType<typeof chargeMock> = orderTotal === 0 ? { method: 'cash', status: 'paid' } : chargeMock(body.payment);
      const [row] = await q.query<{ id: string }>(
        `INSERT INTO orders (ref, user_id, service, gallons, station_id, date, start_hour, name, phone, address, note, price_per_gallon, fee, total, water_type, free_gallon)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [makeRef('AK'), user.id, service, gallons, stationId, date, start, name, normalizePhone(phone), isPickup ? null : formatAddress(address), note || null, pricePerGallon, fee, orderTotal, waterType, freeGallon],
      );
      await q.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [row.id, 'requested', user.id]);
      await q.query('INSERT INTO payments (order_id, method, status, amount, reference, last4, proof, proof_at) VALUES ($1, $2, $3, $4, $5, $6, $7::text, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END)', [
        row.id, payment.method, payment.status, orderTotal, makeRef('MOCK'), payment.last4 ?? null, payment.proof ?? null,
      ]);
      if (!isPickup) await saveAddress(q, user.id, address);
      return row.id;
    });

    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
    return c.json({ order: toOrder(row) }, 201);
  });

  /** Proof screenshots are large, so they are fetched one at a time and not with the order list. */
  app.get('/api/orders/:id/proof', async (c) => {
    const user = requireUser(c);
    const id = c.req.param('id');
    if (!UUID.test(id)) throw new ApiError(404, 'not_found', 'We can not find that order.');
    const rows =
      user.role === 'admin'
        ? await db.query('SELECT p.proof FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.id = $1 AND o.station_id = $2', [id, user.branchId])
        : await db.query('SELECT p.proof FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.id = $1 AND o.user_id = $2', [id, user.id]);
    if (!rows[0]?.proof) throw new ApiError(404, 'not_found', 'No proof of payment on file.');
    return c.json({ proof: rows[0].proof });
  });

  /** Upload, or replace after a rejection, the screenshot for a GCash or Maya payment. */
  app.post('/api/orders/:id/proof', async (c) => {
    const user = requireUser(c);
    if (user.role !== 'customer') throw new ApiError(403, 'customers_only', 'Only the customer can attach a proof of payment.');
    const body = await c.req.json().catch(() => ({}));
    const proof = readProof(body.proof);
    await db.tx(async (q) => {
      const order = await findOrder(q, c.req.param('id'), user);
      if (!isWallet(order.payment.method)) throw new ApiError(409, 'no_proof_needed', 'This order is not paid by GCash or Maya.');
      if (order.payment.status !== 'review' && order.payment.status !== 'rejected') throw new ApiError(409, 'not_changeable', 'This payment can no longer be changed.');
      await q.query("UPDATE payments SET proof = $1, proof_at = now(), status = 'review', updated_at = now() WHERE order_id = $2", [proof, order.id]);
    });
    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [c.req.param('id')]);
    return c.json({ order: toOrder(row) });
  });

  app.patch('/api/orders/:id/time', async (c) => {
    const user = requireUser(c);
    const body = await c.req.json().catch(() => ({}));
    const date = asText(body.date, 10);
    const start = Number(body.start);
    if (!upcomingDays(now()).includes(date) || !Number.isInteger(start)) throw new ApiError(409, 'window_unavailable', 'That window just closed or filled up. Pick another one.');

    await db.tx(async (q) => {
      const order = await findOrder(q, c.req.param('id'), user);
      if (!canChange(order, now())) throw new ApiError(409, 'not_changeable', 'This order has been confirmed by the branch, so it can no longer be changed. Contact the branch if you need help.');
      const where = whereOf(order.service, order.stationId);
      await lockWindow(q, where, date, start);
      await assertWindowOpen(q, where, date, start, now(), order.id);
      await q.query(`UPDATE orders SET date = $1::date, start_hour = $2, status = 'requested', updated_at = now() WHERE id = $3`, [date, start, order.id]);
      await q.query('INSERT INTO order_events (order_id, status, actor_id) VALUES ($1, $2, $3)', [order.id, 'requested', user.id]);
    });
    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [c.req.param('id')]);
    return c.json({ order: toOrder(row) });
  });

  app.post('/api/orders/:id/cancel', async (c) => {
    const user = requireUser(c);
    await db.tx(async (q) => {
      const order = await findOrder(q, c.req.param('id'), user);
      if (!canChange(order, now())) throw new ApiError(409, 'not_changeable', 'This order has been confirmed by the branch, so it can no longer be cancelled. Contact the branch if you need help.');
      await setStatus(q, order.id, order.status, 'cancelled', user.id);
    });
    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [c.req.param('id')]);
    return c.json({ order: toOrder(row) });
  });

  /* ---------- Admin ---------- */

  app.post('/api/admin/orders/:id/status', async (c) => {
    const admin = requireAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    const to = body.status as OrderStatus;

    await db.tx(async (q) => {
      const order = await findOrder(q, c.req.param('id'), admin);
      const reopening = order.status === 'cancelled' && to === 'requested';
      const allowed =
        to === nextStatus(order.status) ||
        to === previousStatus(order.status) ||
        (to === 'cancelled' && !isClosed(order)) ||
        reopening;
      if (!allowed) throw new ApiError(409, 'invalid_transition', 'An order can only move one step at a time.');
      if (to === 'confirmed' && isWallet(order.payment.method) && order.payment.status !== 'paid') {
        throw new ApiError(409, 'payment_unverified', 'Verify the payment first. A GCash or Maya order is confirmed only after its payment is verified.');
      }
      if (reopening) {
        if (order.payment.status === 'refunded') throw new ApiError(409, 'refunded', 'This order was refunded, so it can not be reopened.');
        const where = whereOf(order.service, order.stationId);
        await lockWindow(q, where, order.date, order.start);
        if (fromIso(order.date, order.start) <= now()) throw new ApiError(409, 'window_unavailable', 'That window has already passed.');
        await assertWindowOpen(q, where, order.date, order.start, now(), order.id);
      }
      await setStatus(q, order.id, order.status, to, admin.id);
    });
    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [c.req.param('id')]);
    return c.json({ order: toOrder(row) });
  });

  /** The branch admin checks the proof against their wallet, then verifies or rejects the payment. */
  app.post('/api/admin/orders/:id/payment', async (c) => {
    const admin = requireAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    if (body.decision !== 'verify' && body.decision !== 'reject') throw new ApiError(400, 'invalid_input', 'Choose verify or reject.');
    await db.tx(async (q) => {
      const order = await findOrder(q, c.req.param('id'), admin);
      if (!isWallet(order.payment.method) || order.payment.status !== 'review') {
        throw new ApiError(409, 'not_in_review', 'There is no payment waiting to be verified on this order.');
      }
      await q.query('UPDATE payments SET status = $1, updated_at = now() WHERE order_id = $2', [body.decision === 'verify' ? 'paid' : 'rejected', order.id]);
    });
    const [row] = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [c.req.param('id')]);
    return c.json({ order: toOrder(row) });
  });

  app.all('/api/*', () => {
    throw new ApiError(404, 'not_found', 'Not found.');
  });

  return app;
}
