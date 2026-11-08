import { describe, expect, it } from 'vitest';
import {
  adminActionLabel,
  canChange,
  dayState,
  firstOpen,
  formatMoney,
  formatWindow,
  isOverdue,
  isValidPhone,
  nextStatus,
  previousStatus,
  slotsFor,
  stationById,
  stationOpenNow,
  statusLabel,
  toIcs,
  total,
  unitPrice,
  upcomingDays,
  WINDOW_CAPACITY,
  CITIES,
  CITY_CENTERS,
  deliveryFee,
  passwordProblem,
  rewardStatus,
  type Order,
} from './data';

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  ref: 'AK-TEST',
  userId: 'u1',
  service: 'delivery',
  gallons: 2,
  waterType: 'purified',
  date: '2026-11-10',
  start: 10,
  name: 'Sam',
  phone: '09000000000',
  address: 'Maginhawa St, Quezon City',
  status: 'requested',
  total: 90,
  payment: { method: 'cash', status: 'pending', reference: 'MOCK-TEST' },
  createdAt: 0,
  ...over,
});

describe('pricing', () => {
  it('charges per gallon plus a delivery fee that grows with distance', () => {
    // Maginhawa to the middle of Quezon City is about 4 km, Kapitolyo to Pasig about 2 km.
    expect(total({ service: 'delivery', gallons: 2, stationId: 'maginhawa', city: 'Quezon City' })).toBe(110);
    expect(total({ service: 'swap', gallons: 1, stationId: 'kapitolyo', city: 'Pasig' })).toBe(60);
    expect(deliveryFee('swap', 'maginhawa', 'Muntinlupa')).toBe(100);
  });
  it('quotes the lowest tier until a city is chosen', () => {
    expect(deliveryFee('swap', 'maginhawa')).toBe(20);
  });
  it('gives every city a center so no fee is skipped', () => {
    for (const city of CITIES) expect(CITY_CENTERS[city]).toBeDefined();
  });
  it('charges no fee for station pickup', () => {
    expect(total({ service: 'pickup', gallons: 2, stationId: 'maginhawa', city: 'Muntinlupa' })).toBe(60);
  });
  it('formats pesos', () => {
    expect(formatMoney(1250)).toBe('₱1,250.00');
  });
});

describe('time windows', () => {
  it('uses 12-hour time and only repeats the meridiem when it changes', () => {
    expect(formatWindow(8)).toBe('8–10 AM');
    expect(formatWindow(10)).toBe('10 AM–12 PM');
    expect(formatWindow(12)).toBe('12–2 PM');
    expect(formatWindow(16)).toBe('4–6 PM');
  });
});

describe('availability', () => {
  const monday = new Date(2026, 10, 9, 9, 30);

  it('closes delivery on Sunday', () => {
    expect(slotsFor('route', '2026-11-08', monday, [])).toEqual([]);
    expect(dayState([])).toBe('closed');
  });

  it('marks windows inside the one hour cutoff as passed', () => {
    const slots = slotsFor('route', '2026-11-09', monday, []);
    expect(slots.find((s) => s.start === 8)?.state).toBe('passed');
    expect(slots.find((s) => s.start === 10)?.state).toBe('passed');
    expect(slots.find((s) => s.start === 12)?.state).toBe('open');
  });

  it('only offers windows that fit inside branch hours', () => {
    expect(slotsFor('poblacion', '2026-11-10', monday, []).map((s) => s.start)).toEqual([10, 12, 14, 16]);
    expect(slotsFor('kapitolyo', '2026-11-10', monday, []).map((s) => s.start)).toEqual([8, 10, 12, 14]);
  });

  it('counts orders from every customer and fills up', () => {
    const open = firstOpen(Object.fromEntries(upcomingDays(monday).map((d) => [d, slotsFor('route', d, monday, [])])))!;
    const taken = Array.from({ length: WINDOW_CAPACITY }, (_, i) =>
      order({ id: `o${i}`, userId: `u${i}`, date: open.date, start: open.start }),
    );
    const slot = (list: Order[], exclude?: string) =>
      slotsFor('route', open.date, monday, list, exclude).find((s) => s.start === open.start)!;
    expect(slot([]).left).toBe(WINDOW_CAPACITY);
    expect(slot(taken.slice(0, 2)).left).toBe(WINDOW_CAPACITY - 2);
    expect(slot(taken).state).toBe('full');
    expect(slot(taken, 'o0').state).toBe('open');
  });

  it('ignores cancelled orders when counting spots', () => {
    const open = firstOpen(Object.fromEntries(upcomingDays(monday).map((d) => [d, slotsFor('route', d, monday, [])])))!;
    const cancelled = order({ date: open.date, start: open.start, status: 'cancelled' });
    expect(slotsFor('route', open.date, monday, [cancelled]).find((s) => s.start === open.start)!.left).toBe(WINDOW_CAPACITY);
  });
});

describe('status', () => {
  it('walks the admin flow in order', () => {
    expect(nextStatus('requested')).toBe('confirmed');
    expect(nextStatus('confirmed')).toBe('preparing');
    expect(nextStatus('preparing')).toBe('on_the_way');
    expect(nextStatus('on_the_way')).toBe('delivered');
    expect(nextStatus('delivered')).toBeNull();
    expect(nextStatus('cancelled')).toBeNull();
    expect(previousStatus('requested')).toBeNull();
    expect(previousStatus('delivered')).toBe('on_the_way');
  });

  it('words pickup differently from delivery', () => {
    expect(statusLabel('delivery', 'on_the_way')).toBe('On the way');
    expect(statusLabel('pickup', 'on_the_way')).toBe('Ready');
    expect(adminActionLabel('pickup', 'delivered')).toBe('Mark as picked up');
    expect(adminActionLabel('delivery', 'confirmed')).toBe('Confirm order');
  });

  it('lets customers edit only before preparing starts and before the window', () => {
    const before = new Date(2026, 10, 9, 12);
    expect(canChange(order(), before)).toBe(true);
    expect(canChange(order({ status: 'confirmed' }), before)).toBe(false);
    expect(canChange(order({ status: 'preparing' }), before)).toBe(false);
    expect(canChange(order({ status: 'cancelled' }), before)).toBe(false);
    expect(canChange(order(), new Date(2026, 10, 10, 10))).toBe(false);
  });

  it('flags open orders whose window has ended', () => {
    const after = new Date(2026, 10, 10, 12);
    expect(isOverdue(order({ status: 'preparing' }), after)).toBe(true);
    expect(isOverdue(order({ status: 'delivered' }), after)).toBe(false);
    expect(isOverdue(order(), new Date(2026, 10, 10, 11))).toBe(false);
  });
});

describe('branch hours', () => {
  it('reports open and closed states', () => {
    const kapitolyo = stationById('kapitolyo')!;
    expect(stationOpenNow(kapitolyo, new Date(2026, 10, 8, 9)).label).toBe('Open until 4 PM');
    expect(stationOpenNow(kapitolyo, new Date(2026, 10, 8, 17)).open).toBe(false);
    expect(stationOpenNow(stationById('poblacion')!, new Date(2026, 10, 8, 12)).label).toBe('Closed today');
  });
});

describe('phone numbers', () => {
  it('accepts Philippine mobile formats', () => {
    expect(isValidPhone('09000000000')).toBe(true);
    expect(isValidPhone('0900 000 0000')).toBe(true);
    expect(isValidPhone('+639000000000')).toBe(true);
    expect(isValidPhone('090000000000')).toBe(false);
    expect(isValidPhone('0800 000 0000')).toBe(false);
    expect(isValidPhone('09000000a00')).toBe(false);
    expect(isValidPhone('5550100')).toBe(false);
    expect(isValidPhone('0900000000')).toBe(false);
  });
});

describe('calendar export', () => {
  it('writes local start and end times and escapes commas', () => {
    const ics = toIcs(order({ address: 'Maginhawa St, Quezon City' }));
    expect(ics).toContain('DTSTART:20261110T100000');
    expect(ics).toContain('DTEND:20261110T120000');
    expect(ics).toContain('LOCATION:Maginhawa St\\, Quezon City');
  });
});

describe('password strength', () => {
  it('accepts a strong password', () => {
    expect(passwordProblem('Water-Test#91')).toBeNull();
  });
  it.each([
    ['Sh0rt!a', 'at least 10'],
    ['alllowercase1!', 'uppercase'],
    ['ALLUPPERCASE1!', 'lowercase'],
    ['NoNumbersHere!', 'number'],
    ['NoSymbols12345', 'symbol'],
    ['MyPassword!2026', 'easy to guess'],
    ['Aaaa-Bcd-1234', 'repeating'],
  ])('rejects %s', (pw, hint) => {
    expect(passwordProblem(pw)).toContain(hint);
  });
  it('rejects a password containing the email name', () => {
    expect(passwordProblem('Maria-Santos#91', { email: 'maria.santos@x.com' })).toBeNull();
    expect(passwordProblem('Santos-Water#91', { email: 'santos@x.com' })).toContain('email');
  });
});

describe('water type prices', () => {
  it('adds a per-gallon amount for each type', () => {
    expect(unitPrice('swap', 'purified')).toBe(40);
    expect(unitPrice('swap', 'mineral')).toBe(45);
    expect(unitPrice('swap', 'alkaline')).toBe(50);
    expect(unitPrice('pickup', 'distilled')).toBe(45);
    expect(total({ service: 'pickup', gallons: 2, waterType: 'distilled' })).toBe(90);
    expect(total({ service: 'pickup', gallons: 2, waterType: 'distilled', free: true })).toBe(45);
  });
});

describe('free gallon bonus', () => {
  const done = (n: number) => Array.from({ length: n }, () => order({ status: 'delivered' }));

  it('counts only completed orders toward the next free gallon', () => {
    expect(rewardStatus([...done(5), order({ status: 'requested' }), order({ status: 'cancelled' })])).toMatchObject({ completed: 5, available: 0, toNext: 7 });
    expect(rewardStatus(done(12))).toMatchObject({ available: 1, progress: 0 });
    expect(rewardStatus(done(24)).available).toBe(2);
  });

  it('uses up a free gallon, and gives it back when that order is cancelled', () => {
    expect(rewardStatus([...done(12), order({ status: 'requested', freeGallon: true })]).available).toBe(0);
    expect(rewardStatus([...done(12), order({ status: 'cancelled', freeGallon: true })]).available).toBe(1);
  });

  it('takes one gallon off the total', () => {
    expect(total({ service: 'pickup', gallons: 1 })).toBe(30);
    expect(total({ service: 'pickup', gallons: 1, free: true })).toBe(0);
    expect(total({ service: 'swap', gallons: 3, stationId: 'maginhawa', city: 'Quezon City', free: true })).toBe(80 + 40);
  });
});
