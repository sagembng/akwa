import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { connectEmbedded, connectPostgres, migrate, type Db } from './db';
import { ADMINS, DEMO_EMAIL, DEMO_PASSWORD } from './config';
import { WINDOW_CAPACITY } from '../src/data';

// Real SQL against embedded Postgres, with the clock fixed to a Monday morning in Manila.
const NOW = new Date(2026, 10, 9, 7, 0);
const DATE = '2026-11-10';

let db: Db;
let app: ReturnType<typeof createApp>;

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, body: (await res.json()) as any };
  }
}

// Unique per run so a persistent test database does not collide on emails.
let counter = Date.now();
async function customer() {
  const client = new Client();
  const res = await client.call('POST', '/api/auth/register', {
    name: 'Test Customer',
    email: `customer${++counter}@test.example`,
    phone: '0900 000 0000',
    password: 'Water-Test#91',
    privacyAccepted: true,
  });
  expect(res.status).toBe(201);
  return client;
}

// A branch admin. The default matches the branch of orderBody().
async function admin(branchId = 'maginhawa') {
  const client = new Client();
  const admin = ADMINS.find((a) => a.branchId === branchId)!;
  const res = await client.call('POST', '/api/auth/login', { email: admin.email, password: admin.password });
  expect(res.status).toBe(200);
  return client;
}

// A tiny valid PNG, as the browser would send it.
const PROOF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const orderBody = (over: Record<string, unknown> = {}) => ({
  service: 'delivery',
  stationId: 'maginhawa',
  gallons: 2,
  waterType: 'purified',
  date: DATE,
  start: 10,
  name: 'Test Customer',
  phone: '09000000000',
  house: 'Unit 4',
  street: 'Maginhawa St',
  barangay: 'Teachers Village',
  city: 'Quezon City',
  payment: { method: 'cash' },
  ...over,
});

beforeAll(async () => {
  // Set TEST_DATABASE_URL to run these through the Neon code path. Use a throwaway
  // database: the tests delete every order.
  const url = process.env.TEST_DATABASE_URL;
  db = url ? await connectPostgres(url) : await connectEmbedded();
  await migrate(db);
  app = createApp(db, { now: () => NOW, secureCookies: false });
});

afterAll(() => db.close());

beforeEach(async () => {
  await db.exec('DELETE FROM orders');
});

describe('accounts', () => {
  it('stores a hash, never the password', async () => {
    await customer();
    const [row] = await db.query(`SELECT password_hash FROM users WHERE email = 'customer${counter}@test.example'`);
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain('Water-Test#91');
  });

  it('never returns the password hash from login', async () => {
    const client = await customer();
    const res = await client.call('POST', '/api/auth/login', { email: `customer${counter}@test.example`, password: 'Water-Test#91' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
  });

  it('says whether the email or the password is wrong', async () => {
    await customer();
    const email = `customer${counter}@test.example`;
    const unknown = await new Client().call('POST', '/api/auth/login', { email: 'nobody@test.example', password: 'Water-Test#91' });
    expect(unknown.body.error).toMatchObject({ code: 'email_not_found', field: 'email' });
    const wrong = await new Client().call('POST', '/api/auth/login', { email, password: 'Wrong-Pass#12' });
    expect(wrong.body.error).toMatchObject({ code: 'wrong_password', field: 'password' });
    expect((await new Client().call('POST', '/api/auth/login', { email, password: '' })).body.error.field).toBe('password');
  });

  it('logs in the hardcoded demo customer', async () => {
    const res = await new Client().call('POST', '/api/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('customer');
  });

  it('rejects weak passwords on register', async () => {
    const res = await new Client().call('POST', '/api/auth/register', { name: 'X', email: 'weak@test.example', phone: '09000000000', password: 'password1', privacyAccepted: true });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('password');
  });

  it('charges a delivery fee by distance from the chosen branch', async () => {
    const a = await customer();
    const near = (await a.call('POST', '/api/orders', orderBody({ stationId: 'maginhawa', city: 'Quezon City' }))).body.order;
    const far = (await a.call('POST', '/api/orders', orderBody({ stationId: 'maginhawa', city: 'Muntinlupa', start: 12 }))).body.order;
    expect(near.total).toBe(110);
    expect(far.total).toBe(170);
    expect((await a.call('POST', '/api/orders', orderBody({ stationId: undefined }))).status).toBe(400);
  });

  it('rejects wrong passwords, duplicate emails and missing consent', async () => {
    const client = await customer();
    const email = `customer${counter}@test.example`;
    expect((await new Client().call('POST', '/api/auth/login', { email, password: 'nope-nope' })).status).toBe(401);
    const base = { name: 'X', phone: '09000000000', password: 'Water-Test#91', privacyAccepted: true };
    expect((await new Client().call('POST', '/api/auth/register', { ...base, email: email.toUpperCase() })).status).toBe(409);
    const noConsent = await new Client().call('POST', '/api/auth/register', { ...base, email: 'new@test.example', privacyAccepted: false });
    expect(noConsent.status).toBe(400);
    expect(noConsent.body.error.field).toBe('privacyAccepted');
    expect(client.cookie).not.toBe('');
  });

  it('logout ends the session on the server', async () => {
    const client = await customer();
    const cookie = client.cookie;
    await client.call('POST', '/api/auth/logout', {});
    const replay = new Client();
    replay.cookie = cookie;
    expect((await replay.call('GET', '/api/me')).body.user).toBeNull();
  });

  it('cannot register as admin by sending a role', async () => {
    const client = new Client();
    const res = await client.call('POST', '/api/auth/register', {
      name: 'Sneaky', email: 'sneaky@test.example', phone: '09000000000', password: 'Water-Test#91', privacyAccepted: true, role: 'admin',
    });
    expect(res.body.user.role).toBe('customer');
  });

  it('refuses writes that are not JSON', async () => {
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
    expect(res.status).toBe(415);
  });
});

describe('access control', () => {
  it('requires a login to see or place orders', async () => {
    const guest = new Client();
    expect((await guest.call('GET', '/api/orders')).status).toBe(401);
    expect((await guest.call('POST', '/api/orders', orderBody())).status).toBe(401);
  });

  it('keeps customers out of each other’s orders', async () => {
    const a = await customer();
    const b = await customer();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect((await b.call('GET', '/api/orders')).body.orders).toEqual([]);
    expect((await b.call('POST', `/api/orders/${order.id}/cancel`, {})).status).toBe(404);
    expect((await b.call('PATCH', `/api/orders/${order.id}/time`, { date: DATE, start: 12 })).status).toBe(404);
  });

  it('lets only admins change status', async () => {
    const a = await customer();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect((await a.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(403);
    expect((await new Client().call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(401);
  });

  it('has exactly three admins, one per branch', async () => {
    const rows = await db.query("SELECT email, branch_id FROM users WHERE role = 'admin' ORDER BY branch_id");
    expect(rows.map((r) => r.branch_id)).toEqual(['kapitolyo', 'maginhawa', 'poblacion']);
  });

  it('shows each branch admin only their own branch', async () => {
    const a = await customer();
    const mine = (await a.call('POST', '/api/orders', orderBody({ stationId: 'maginhawa' }))).body.order;
    const other = (await a.call('POST', '/api/orders', orderBody({ stationId: 'kapitolyo', start: 12 }))).body.order;
    const maginhawa = await admin('maginhawa');
    const kapitolyo = await admin('kapitolyo');
    expect((await maginhawa.call('GET', '/api/orders')).body.orders.map((o: any) => o.id)).toEqual([mine.id]);
    expect((await kapitolyo.call('GET', '/api/orders')).body.orders.map((o: any) => o.id)).toEqual([other.id]);
    expect((await maginhawa.call('POST', `/api/admin/orders/${other.id}/status`, { status: 'confirmed' })).status).toBe(404);
    expect((await (await admin('poblacion')).call('GET', '/api/orders')).body.orders).toEqual([]);
  });

  it('gives a branch admin their orders but no customer flow', async () => {
    const a = await customer();
    await a.call('POST', '/api/orders', orderBody());
    const boss = await admin();
    expect((await boss.call('GET', '/api/orders')).body.orders).toHaveLength(1);
    expect((await boss.call('POST', '/api/orders', orderBody())).status).toBe(403);
  });
});

describe('placing orders', () => {
  it('sets the price on the server, ignoring what the browser sends', async () => {
    const a = await customer();
    const res = await a.call('POST', '/api/orders', orderBody({ total: 1, pricePerGallon: 1, fee: 0, status: 'delivered' }));
    expect(res.status).toBe(201);
    expect(res.body.order.total).toBe(110);
    expect(res.body.order.status).toBe('requested');
  });

  it('rejects invalid input and closed windows', async () => {
    const a = await customer();
    expect((await a.call('POST', '/api/orders', orderBody({ gallons: 7 }))).status).toBe(400);
    expect((await a.call('POST', '/api/orders', orderBody({ phone: '123' }))).body.error.field).toBe('phone');
    expect((await a.call('POST', '/api/orders', orderBody({ phone: '0900000000' }))).body.error.field).toBe('phone');
    expect((await a.call('POST', '/api/orders', orderBody({ phone: '090000000000' }))).body.error.field).toBe('phone');
    expect((await a.call('POST', '/api/orders', orderBody({ house: '' }))).body.error.field).toBe('house');
    expect((await a.call('POST', '/api/orders', orderBody({ street: '' }))).body.error.field).toBe('street');
    expect((await a.call('POST', '/api/orders', orderBody({ barangay: '' }))).body.error.field).toBe('barangay');
    expect((await a.call('POST', '/api/orders', orderBody({ city: 'Cebu' }))).body.error.field).toBe('city');
    expect((await a.call('POST', '/api/orders', orderBody({ date: '2026-11-08' }))).status).toBe(409);
    expect((await a.call('POST', '/api/orders', orderBody({ start: 9 }))).status).toBe(409);
    expect((await a.call('POST', '/api/orders', orderBody({ service: 'pickup', stationId: 'nowhere' }))).status).toBe(400);
  });

  it('never oversells a window, even when requests arrive together', async () => {
    const clients = await Promise.all(Array.from({ length: WINDOW_CAPACITY + 3 }, () => customer()));
    const results = await Promise.all(clients.map((c) => c.call('POST', '/api/orders', orderBody())));
    expect(results.filter((r) => r.status === 201)).toHaveLength(WINDOW_CAPACITY);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('frees a spot on cancel and shows no customer data in availability', async () => {
    const a = await customer();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    const guest = new Client();
    const slot = async () => (await guest.call('GET', '/api/availability?where=route')).body.days[DATE].find((s: any) => s.start === 10);
    expect((await slot()).left).toBe(WINDOW_CAPACITY - 1);
    const raw = await guest.call('GET', '/api/availability?where=route');
    expect(JSON.stringify(raw.body)).not.toContain('Test Customer');
    await a.call('POST', `/api/orders/${order.id}/cancel`, {});
    expect((await slot()).left).toBe(WINDOW_CAPACITY);
  });

  it('remembers the delivery address for next time', async () => {
    const a = await customer();
    await a.call('POST', '/api/orders', orderBody());
    expect((await a.call('GET', '/api/me')).body.details).toEqual({ house: 'Unit 4', street: 'Maginhawa St', barangay: 'Teachers Village', city: 'Quezon City' });
    const [order] = (await a.call('GET', '/api/orders')).body.orders;
    expect(order.address).toBe('Unit 4 Maginhawa St, Brgy. Teachers Village, Quezon City');
  });
});

describe('address at registration', () => {
  it('saves a registered address so booking is filled in', async () => {
    const client = new Client();
    const res = await client.call('POST', '/api/auth/register', {
      name: 'With Address', email: `addr${++counter}@test.example`, phone: '09000000000', password: 'Water-Test#91', privacyAccepted: true,
      address: { house: '12', street: 'Kalayaan Ave', barangay: 'Diliman', city: 'Quezon City' },
    });
    expect(res.status).toBe(201);
    expect(res.body.details).toEqual({ house: '12', street: 'Kalayaan Ave', barangay: 'Diliman', city: 'Quezon City' });
  });

  it('needs every part when any part is given, and none is fine', async () => {
    const base = { name: 'X', phone: '09000000000', password: 'Water-Test#91', privacyAccepted: true };
    const partial = await new Client().call('POST', '/api/auth/register', { ...base, email: `p${++counter}@test.example`, address: { house: '12', street: '', barangay: '', city: '' } });
    expect(partial.status).toBe(400);
    expect(partial.body.error.field).toBe('street');
    const none = await new Client().call('POST', '/api/auth/register', { ...base, email: `n${++counter}@test.example` });
    expect(none.status).toBe(201);
    expect(none.body.details).toBeNull();
  });
});

describe('mock payments', () => {
  it('pays with the success test card and keeps only the last 4 digits', async () => {
    const a = await customer();
    const { order } = (await a.call('POST', '/api/orders', orderBody({ payment: { method: 'card', last4: '4242' } }))).body;
    expect(order.payment).toMatchObject({ method: 'card', status: 'paid', last4: '4242' });
    expect(order.payment.reference).toMatch(/^MOCK-/);
  });

  it('creates no order when a payment is declined', async () => {
    const a = await customer();
    expect((await a.call('POST', '/api/orders', orderBody({ payment: { method: 'card', last4: '0002' } }))).status).toBe(402);
    expect((await a.call('GET', '/api/orders')).body.orders).toEqual([]);
  });

  it('refuses anything that is not a test card', async () => {
    const a = await customer();
    const res = await a.call('POST', '/api/orders', orderBody({ payment: { method: 'card', last4: '1111' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('test_cards_only');
    expect((await a.call('POST', '/api/orders', orderBody({ payment: { method: 'bitcoin' } }))).status).toBe(400);
    expect((await a.call('POST', '/api/orders', orderBody({ payment: undefined }))).status).toBe(400);
  });

  it('refunds a paid order when it is cancelled, and blocks reopening it', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody({ payment: { method: 'maya', proof: PROOF } }))).body;
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/payment`, { decision: 'verify' })).body.order.payment.status).toBe('paid');
    expect((await a.call('POST', `/api/orders/${order.id}/cancel`, {})).body.order.payment.status).toBe('refunded');
    const reopen = await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'requested' });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('refunded');
  });

  it('marks cash paid on delivery, and walks it back if the admin steps back', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect(order.payment.status).toBe('pending');
    const move = (status: string) => boss.call('POST', `/api/admin/orders/${order.id}/status`, { status });
    await move('confirmed');
    await move('preparing');
    await move('on_the_way');
    expect((await move('delivered')).body.order.payment.status).toBe('paid');
    expect((await move('on_the_way')).body.order.payment.status).toBe('pending');
  });

  it('voids unpaid cash on cancel and restores it when reopened', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect((await a.call('POST', `/api/orders/${order.id}/cancel`, {})).body.order.payment.status).toBe('void');
    const reopened = await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'requested' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.order.payment.status).toBe('pending');
  });
});

describe('water type', () => {
  it('saves the chosen type, defaults to purified and refuses unknown ones', async () => {
    const a = await customer();
    expect((await a.call('POST', '/api/orders', orderBody({ waterType: 'distilled' }))).body.order.waterType).toBe('distilled');
    expect((await a.call('POST', '/api/orders', orderBody({ waterType: undefined, start: 12 }))).body.order.waterType).toBe('purified');
    const bad = await a.call('POST', '/api/orders', orderBody({ waterType: 'tap', start: 14 }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.field).toBe('waterType');
  });
});

describe('water type prices', () => {
  it('charges each type its own price, set by the server', async () => {
    const a = await customer();
    const price = async (waterType: string, start: number) =>
      (await a.call('POST', '/api/orders', orderBody({ waterType, start, total: 1 }))).body.order.total;
    // Delivery: 2 gallons at 35 + type extra, plus a 40 fee from Maginhawa to Quezon City.
    expect(await price('purified', 8)).toBe(110);
    expect(await price('mineral', 10)).toBe(120);
    expect(await price('alkaline', 12)).toBe(130);
    expect(await price('distilled', 14)).toBe(140);
  });
});

describe('free gallon bonus', () => {
  // Gives a customer 12 delivered orders straight in the database.
  async function veteran(delivered = 12) {
    const a = await customer();
    const [u] = await db.query('SELECT id FROM users WHERE email = $1', [`customer${counter}@test.example`]);
    for (let i = 0; i < delivered; i++) {
      await db.query(
        `WITH o AS (
           INSERT INTO orders (ref, user_id, service, gallons, station_id, date, start_hour, name, phone, address, status, price_per_gallon, fee, total)
           VALUES ($1, $2, 'pickup', 1, 'maginhawa', '2026-11-02', 8, 'V', '09000000000', NULL, 'delivered', 30, 0, 30) RETURNING id)
         INSERT INTO payments (order_id, method, status, amount, reference) SELECT id, 'cash', 'paid', 30, 'MOCK-V' FROM o`,
        [`AK-V${counter}${i}`, u.id],
      );
    }
    return a;
  }

  it('gives no discount before 12 orders', async () => {
    const a = await veteran(11);
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect(order.freeGallon).toBeUndefined();
    expect(order.total).toBe(110);
  });

  it('takes one gallon off the 13th order, once', async () => {
    const a = await veteran(12);
    const first = (await a.call('POST', '/api/orders', orderBody())).body.order;
    expect(first.freeGallon).toBe(true);
    expect(first.total).toBe(110 - 35);
    const second = (await a.call('POST', '/api/orders', orderBody({ start: 12 }))).body.order;
    expect(second.freeGallon).toBeUndefined();
    expect(second.total).toBe(110);
  });

  it('gives the free gallon back when the order using it is cancelled', async () => {
    const a = await veteran(12);
    const first = (await a.call('POST', '/api/orders', orderBody())).body.order;
    await a.call('POST', `/api/orders/${first.id}/cancel`, {});
    expect((await a.call('POST', '/api/orders', orderBody({ start: 12 }))).body.order.freeGallon).toBe(true);
  });

  it('needs no payment when the bonus covers the whole order', async () => {
    const a = await veteran(12);
    const { order } = (await a.call('POST', '/api/orders', orderBody({ service: 'pickup', gallons: 1, payment: undefined }))).body;
    expect(order.total).toBe(0);
    expect(order.payment.status).toBe('paid');
  });
});

describe('QR payments with proof', () => {
  const wallet = (method = 'gcash') => orderBody({ payment: { method, proof: PROOF } });

  it('needs a screenshot for GCash and Maya', async () => {
    const a = await customer();
    for (const method of ['gcash', 'maya']) {
      const none = await a.call('POST', '/api/orders', orderBody({ payment: { method } }));
      expect(none.status).toBe(400);
      expect(none.body.error.field).toBe('proof');
    }
    const notImage = await a.call('POST', '/api/orders', orderBody({ payment: { method: 'gcash', proof: 'data:text/html;base64,PGI+' } }));
    expect(notImage.status).toBe(400);
    expect((await a.call('GET', '/api/orders')).body.orders).toEqual([]);
  });

  it('waits for verification and keeps the image out of the order list', async () => {
    const a = await customer();
    const { order } = (await a.call('POST', '/api/orders', wallet())).body;
    expect(order.payment).toMatchObject({ method: 'gcash', status: 'review', hasProof: true });
    expect(JSON.stringify((await a.call('GET', '/api/orders')).body)).not.toContain('base64');
    expect((await a.call('GET', `/api/orders/${order.id}/proof`)).body.proof).toBe(PROOF);
  });

  it('blocks confirming until the branch admin verifies the payment', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', wallet())).body;
    const confirm = () => boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' });
    const blocked = await confirm();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('payment_unverified');
    expect((await boss.call('GET', `/api/orders/${order.id}/proof`)).body.proof).toBe(PROOF);
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/payment`, { decision: 'verify' })).body.order.payment.status).toBe('paid');
    expect((await confirm()).status).toBe(200);
  });

  it('lets the customer resend a receipt after a rejection', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', wallet('maya'))).body;
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/payment`, { decision: 'reject' })).body.order.payment.status).toBe('rejected');
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(409);
    const resent = await a.call('POST', `/api/orders/${order.id}/proof`, { proof: PROOF });
    expect(resent.body.order.payment.status).toBe('review');
  });

  it('keeps proofs private to the customer and their branch admin', async () => {
    const a = await customer();
    const b = await customer();
    const { order } = (await a.call('POST', '/api/orders', wallet())).body;
    expect((await b.call('GET', `/api/orders/${order.id}/proof`)).status).toBe(404);
    expect((await (await admin('kapitolyo')).call('GET', `/api/orders/${order.id}/proof`)).status).toBe(404);
    expect((await a.call('POST', `/api/admin/orders/${order.id}/payment`, { decision: 'verify' })).status).toBe(403);
    expect((await (await admin('kapitolyo')).call('POST', `/api/admin/orders/${order.id}/payment`, { decision: 'verify' })).status).toBe(404);
  });

  it('voids an unverified payment on cancel, and refunds a verified one', async () => {
    const a = await customer();
    const boss = await admin();
    const first = (await a.call('POST', '/api/orders', wallet())).body.order;
    expect((await a.call('POST', `/api/orders/${first.id}/cancel`, {})).body.order.payment.status).toBe('void');
    const second = (await a.call('POST', '/api/orders', { ...wallet(), start: 12 })).body.order;
    await boss.call('POST', `/api/admin/orders/${second.id}/payment`, { decision: 'verify' });
    expect((await a.call('POST', `/api/orders/${second.id}/cancel`, {})).body.order.payment.status).toBe('refunded');
  });
});

describe('order status rules', () => {
  it('moves one step at a time and logs who did it', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'delivered' })).status).toBe(409);
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(200);
    const events = await db.query('SELECT status, actor_id FROM order_events WHERE order_id = $1 ORDER BY id', [order.id]);
    expect(events.map((e) => e.status)).toEqual(['requested', 'confirmed']);
    expect(events[0].actor_id).not.toBe(events[1].actor_id);
  });

  it('locks customers out once preparing starts', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' });
    await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'preparing' });
    expect((await a.call('POST', `/api/orders/${order.id}/cancel`, {})).status).toBe(409);
    expect((await a.call('PATCH', `/api/orders/${order.id}/time`, { date: DATE, start: 12 })).status).toBe(409);
  });

  it('lets the customer change the time while the order is only requested', async () => {
    const a = await customer();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    const moved = await a.call('PATCH', `/api/orders/${order.id}/time`, { date: DATE, start: 12 });
    expect(moved.body.order).toMatchObject({ start: 12, status: 'requested' });
  });

  it('locks the customer out of cancelling or rescheduling once the branch confirms', async () => {
    const a = await customer();
    const boss = await admin();
    const { order } = (await a.call('POST', '/api/orders', orderBody())).body;
    await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'confirmed' });
    expect((await a.call('POST', `/api/orders/${order.id}/cancel`, {})).status).toBe(409);
    expect((await a.call('PATCH', `/api/orders/${order.id}/time`, { date: DATE, start: 12 })).status).toBe(409);
    // The branch can still cancel.
    expect((await boss.call('POST', `/api/admin/orders/${order.id}/status`, { status: 'cancelled' })).status).toBe(200);
  });
});
