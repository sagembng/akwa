// Catalogue, scheduling rules and order status. Prices and branches are sample
// data: the branches are made up and sit at made-up points in Metro Manila.

export type ServiceId = 'delivery' | 'swap' | 'pickup';

export interface Service {
  id: ServiceId;
  name: string;
  summary: string;
  noun: string;
  action: string;
  pricePerGallon: number;
  /** Delivered by a branch, so the delivery fee depends on distance. */
  delivered: boolean;
  /** Shown as a badge in the picker. */
  tag?: string;
}

export const SERVICES: Service[] = [
  { id: 'swap', name: 'Container swap', summary: 'We bring full gallons and take your empties back.', noun: 'swap', action: 'Request a swap', pricePerGallon: 40, delivered: true, tag: 'Most common' },
  { id: 'delivery', name: 'Refill delivery', summary: 'New full gallons brought to your door. You keep the containers.', noun: 'refill', action: 'Request a refill', pricePerGallon: 35, delivered: true },
  { id: 'pickup', name: 'Station pickup', summary: 'Reserve a time and collect at a branch.', noun: 'pickup', action: 'Reserve a pickup', pricePerGallon: 30, delivered: false },
];

export const serviceById = (id: ServiceId) => SERVICES.find((s) => s.id === id)!;

/* ---------- Water type ---------- */

export type WaterType = 'purified' | 'mineral' | 'alkaline' | 'distilled';

// Sample prices. Each type adds a fixed amount per gallon to the service's base price
// (the base price is the purified price), so change them here and everything follows.
export const WATER_TYPES: { id: WaterType; name: string; summary: string; extra: number }[] = [
  { id: 'purified', name: 'Purified', summary: 'Filtered and treated. The everyday choice.', extra: 0 },
  { id: 'mineral', name: 'Mineral', summary: 'Keeps its natural minerals.', extra: 5 },
  { id: 'alkaline', name: 'Alkaline', summary: 'A higher pH than regular water.', extra: 10 },
  { id: 'distilled', name: 'Distilled', summary: 'Boiled and condensed, with minerals removed.', extra: 15 },
];

/** Price of one gallon for this service and type of water. */
export const unitPrice = (service: ServiceId, waterType: string = 'purified') =>
  serviceById(service).pricePerGallon + (waterTypeById(waterType)?.extra ?? 0);

export const waterTypeById = (id: string) => WATER_TYPES.find((w) => w.id === id);
export const waterTypeName = (id: string) => waterTypeById(id)?.name ?? 'Purified';

export interface Station {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  /** 0 = Sunday */
  days: number[];
  open: number;
  close: number;
  hours: string;
}

export const STATIONS: Station[] = [
  { id: 'maginhawa', name: 'Akwa Maginhawa', area: 'Maginhawa St, Teachers Village, Quezon City', lat: 14.6447, lng: 121.0637, days: [1, 2, 3, 4, 5, 6], open: 8, close: 18, hours: 'Mon to Sat, 8 AM–6 PM' },
  { id: 'kapitolyo', name: 'Akwa Kapitolyo', area: 'East Capitol Dr, Kapitolyo, Pasig', lat: 14.5716, lng: 121.0617, days: [0, 1, 2, 3, 4, 5, 6], open: 8, close: 16, hours: 'Every day, 8 AM–4 PM' },
  { id: 'poblacion', name: 'Akwa Poblacion', area: 'P. Burgos St, Poblacion, Makati', lat: 14.5654, lng: 121.0295, days: [1, 2, 3, 4, 5], open: 10, close: 18, hours: 'Mon to Fri, 10 AM–6 PM' },
];

export const stationById = (id: string) => STATIONS.find((s) => s.id === id);

/* ---------- Delivery fee ---------- */

// Approximate city centers. Delivery fees use the straight-line distance from the
// chosen branch to the middle of your city, because the app has no address geocoder.
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Caloocan: { lat: 14.65, lng: 120.983 },
  'Las Piñas': { lat: 14.4445, lng: 120.9939 },
  Makati: { lat: 14.5547, lng: 121.0244 },
  Malabon: { lat: 14.6625, lng: 120.957 },
  Mandaluyong: { lat: 14.5794, lng: 121.0359 },
  Manila: { lat: 14.5995, lng: 120.9842 },
  Marikina: { lat: 14.6507, lng: 121.1029 },
  Muntinlupa: { lat: 14.4081, lng: 121.0415 },
  Navotas: { lat: 14.6667, lng: 120.9417 },
  Parañaque: { lat: 14.4793, lng: 121.0198 },
  Pasay: { lat: 14.5378, lng: 121.0014 },
  Pasig: { lat: 14.5764, lng: 121.0851 },
  Pateros: { lat: 14.5446, lng: 121.0687 },
  'Quezon City': { lat: 14.676, lng: 121.0437 },
  'San Juan': { lat: 14.6019, lng: 121.0355 },
  Taguig: { lat: 14.5176, lng: 121.0509 },
  Valenzuela: { lat: 14.7011, lng: 120.983 },
};

/** Fee tiers: up to this many km from the branch costs this many pesos. */
export const FEE_TIERS = [
  { upToKm: 3, fee: 20 },
  { upToKm: 6, fee: 40 },
  { upToKm: 10, fee: 60 },
  { upToKm: 15, fee: 80 },
  { upToKm: Infinity, fee: 100 },
];

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Null until a branch and city are known, and for pickup, which has no fee. */
export function deliveryDistanceKm(stationId?: string, city?: string) {
  const station = stationById(stationId ?? '');
  const center = city ? CITY_CENTERS[city] : undefined;
  return station && center ? distanceKm(station, center) : null;
}

export function deliveryFee(service: ServiceId, stationId?: string, city?: string) {
  if (!serviceById(service).delivered) return 0;
  const km = deliveryDistanceKm(stationId, city);
  // Until the city is chosen, quote the lowest tier.
  if (km === null) return FEE_TIERS[0].fee;
  return FEE_TIERS.find((t) => km <= t.upToKm)!.fee;
}

export const CITIES = ['Caloocan', 'Las Piñas', 'Makati', 'Malabon', 'Mandaluyong', 'Manila', 'Marikina', 'Muntinlupa', 'Navotas', 'Parañaque', 'Pasay', 'Pasig', 'Pateros', 'Quezon City', 'San Juan', 'Taguig', 'Valenzuela'];

/* ---------- Google Maps ---------- */

// Keyless embed: one pin per map. A Maps API key would allow every branch on one map.
export const mapEmbedUrl = (s: Station) => `https://www.google.com/maps?q=${s.lat},${s.lng}&z=16&hl=en&output=embed`;
export const directionsUrl = (s: Station) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`;
export const addressMapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/* ---------- Orders ---------- */

export type OrderStatus = 'requested' | 'confirmed' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export const ORDER_FLOW: OrderStatus[] = ['requested', 'confirmed', 'preparing', 'on_the_way', 'delivered'];

export const MAX_GALLONS = 6;
export const DAYS_AHEAD = 14;
export const WINDOW_CAPACITY = 5;
const WINDOWS = [8, 10, 12, 14, 16];
const WINDOW_HOURS = 2;
const DELIVERY_DAYS = [1, 2, 3, 4, 5, 6];
/** A window stops taking orders this long before it starts. */
const CUTOFF_MS = 60 * 60 * 1000;

export interface Order {
  id: string;
  ref: string;
  userId: string;
  service: ServiceId;
  gallons: number;
  waterType: WaterType;
  /** One gallon of this order was free, from the 12-order bonus. */
  freeGallon?: boolean;
  stationId?: string;
  date: string; // YYYY-MM-DD, local
  start: number; // hour of day
  name: string;
  phone: string;
  address?: string;
  note?: string;
  status: OrderStatus;
  /** Set by the server when the order is placed, so later price changes do not touch it. */
  total: number;
  payment: OrderPayment;
  createdAt: number;
}

/** The fields availability needs, so it never sees customer details. */
export type SlotOrder = Pick<Order, 'id' | 'service' | 'stationId' | 'date' | 'start' | 'status'>;

/* ---------- Mock payments ---------- */

export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'cash';
// 'review' = proof of payment uploaded, waiting for the branch admin.
// 'rejected' = the admin could not verify it, so the customer uploads a new one.
export type PaymentStatus = 'paid' | 'pending' | 'review' | 'rejected' | 'refunded' | 'void';

export const isWallet = (m: PaymentMethod): m is 'gcash' | 'maya' => m === 'gcash' || m === 'maya';
export const QR_IMAGES = { gcash: '/qr/gcash.png', maya: '/qr/paymaya.png' } as const;
/** Largest proof-of-payment image the server accepts, as a data URL. */
export const MAX_PROOF_CHARS = 1_500_000;

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  last4?: string;
  /** A proof image is on file. It is fetched separately because it is too big to poll. */
  hasProof?: boolean;
}

// Published-style test numbers. Anything else is refused, and the full number never leaves the browser.
export const TEST_CARDS = { approved: '4242424242424242', declined: '4000000000000002' };

export function paymentMethodLabel(p: Pick<OrderPayment, 'method' | 'last4'>, service?: ServiceId) {
  if (p.method === 'gcash') return 'GCash';
  if (p.method === 'maya') return 'Maya';
  if (p.method === 'card') return p.last4 ? `Test card ending ${p.last4}` : 'Test card';
  return service === 'pickup' ? 'Cash at the branch' : 'Cash on delivery';
}

export function paymentStatusLabel(p: Pick<OrderPayment, 'status'>) {
  return { paid: 'Paid', pending: 'Pay on arrival', review: 'Awaiting verification', rejected: 'Proof rejected', refunded: 'Refunded', void: 'Not charged' }[p.status];
}

export const total = (o: { service: ServiceId; gallons: number; waterType?: string; stationId?: string; city?: string; free?: boolean }) =>
  unitPrice(o.service, o.waterType) * o.gallons + deliveryFee(o.service, o.stationId, o.city) - (o.free ? unitPrice(o.service, o.waterType) : 0);

/* ---------- Bonus: a free gallon every 12 orders ---------- */

export const REWARD_EVERY = 12;

/**
 * Every delivered or picked-up order counts. Each 12 earns one free gallon, which comes off the
 * next order. A cancelled order gives its free gallon back. The server uses the same rule.
 */
export function rewardStatus(orders: Pick<Order, 'status' | 'freeGallon'>[]) {
  const completed = orders.filter((o) => o.status === 'delivered').length;
  const used = orders.filter((o) => o.freeGallon && o.status !== 'cancelled').length;
  const available = Math.max(0, Math.floor(completed / REWARD_EVERY) - used);
  return { completed, available, progress: completed % REWARD_EVERY, toNext: REWARD_EVERY - (completed % REWARD_EVERY) };
}

export const gallonsLabel = (n: number) => `${n} ${n === 1 ? 'gallon' : 'gallons'}`;

/* ---------- Dates ---------- */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Manila's wall clock as a Date whose local fields read as Manila time. Windows are
 * stored as a date and an hour, so this keeps browser and server (often on UTC) in step.
 */
export const manilaNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));

export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromIso = (iso: string, hour = 0) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour);
};

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const formatDay = (iso: string) =>
  fromIso(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

const hour12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
const meridiem = (h: number) => (h < 12 ? 'AM' : 'PM');
export const formatHour = (h: number) => `${hour12(h)} ${meridiem(h)}`;

export const formatWindow = (start: number) => {
  const end = start + WINDOW_HOURS;
  return meridiem(start) === meridiem(end)
    ? `${hour12(start)}–${hour12(end)} ${meridiem(end)}`
    : `${formatHour(start)}–${formatHour(end)}`;
};

export const formatMoney = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ---------- Availability ---------- */

export type SlotState = 'open' | 'full' | 'passed';

export interface Slot {
  start: number;
  state: SlotState;
  left: number;
}

export type DayState = 'open' | 'full' | 'closed';

export const whereOf = (service: ServiceId, stationId?: string) =>
  service === 'pickup' ? stationId ?? STATIONS[0].id : 'route';

function windowsFor(where: string, date: string): number[] {
  const weekday = fromIso(date).getDay();
  if (where === 'route') return DELIVERY_DAYS.includes(weekday) ? WINDOWS : [];
  const station = stationById(where);
  if (!station || !station.days.includes(weekday)) return [];
  return WINDOWS.filter((w) => w >= station.open && w + WINDOW_HOURS <= station.close);
}

export function slotsFor(where: string, date: string, now: Date, orders: SlotOrder[], excludeId?: string): Slot[] {
  return windowsFor(where, date).map((start) => {
    const taken = orders.filter(
      (o) => o.status !== 'cancelled' && o.id !== excludeId && whereOf(o.service, o.stationId) === where && o.date === date && o.start === start,
    ).length;
    const left = Math.max(0, WINDOW_CAPACITY - taken);
    const passed = fromIso(date, start).getTime() - now.getTime() < CUTOFF_MS;
    return { start, left, state: passed ? 'passed' : left === 0 ? 'full' : 'open' };
  });
}

export function dayState(slots: Slot[]): DayState {
  if (slots.length === 0) return 'closed';
  return slots.some((s) => s.state === 'open') ? 'open' : 'full';
}

export const upcomingDays = (now: Date) =>
  Array.from({ length: DAYS_AHEAD }, (_, i) => toIso(addDays(now, i)));

export type Availability = Record<string, Slot[]>;

export function firstOpen(days: Availability) {
  for (const date of Object.keys(days).sort()) {
    const slot = days[date].find((s) => s.state === 'open');
    if (slot) return { date, start: slot.start };
  }
  return null;
}

export function stationOpenNow(station: Station, now: Date) {
  const hour = now.getHours() + now.getMinutes() / 60;
  if (!station.days.includes(now.getDay())) return { open: false, label: 'Closed today' };
  if (hour < station.open) return { open: false, label: `Opens at ${formatHour(station.open)}` };
  if (hour >= station.close) return { open: false, label: 'Closed for today' };
  return { open: true, label: `Open until ${formatHour(station.close)}` };
}

/* ---------- Status ---------- */

// Status is only ever set by an admin. Pickup reads differently because nothing travels.
export function statusLabel(service: ServiceId, status: OrderStatus): string {
  if (service === 'pickup') {
    if (status === 'on_the_way') return 'Ready';
    if (status === 'delivered') return 'Picked up';
  }
  return {
    requested: 'Requested',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    on_the_way: 'On the way',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }[status];
}

export const stageOf = (status: OrderStatus) => ORDER_FLOW.indexOf(status);

export const nextStatus = (status: OrderStatus): OrderStatus | null => {
  const i = stageOf(status);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
};

export const previousStatus = (status: OrderStatus): OrderStatus | null => {
  const i = stageOf(status);
  return i > 0 ? ORDER_FLOW[i - 1] : null;
};

export function adminActionLabel(service: ServiceId, next: OrderStatus) {
  if (next === 'confirmed') return 'Confirm order';
  return `Mark as ${statusLabel(service, next).toLowerCase()}`;
}

export const isClosed = (o: Order) => o.status === 'delivered' || o.status === 'cancelled';

/** Customers can change or cancel an order only until a branch admin confirms it. */
export const canChange = (o: Order, now: Date) => o.status === 'requested' && now < fromIso(o.date, o.start);

export const isOverdue = (o: Order, now: Date) => !isClosed(o) && now >= fromIso(o.date, o.start + WINDOW_HOURS);

export function statusHeadline(o: Order) {
  const noun = serviceById(o.service).noun;
  switch (o.status) {
    case 'requested':
      return `Your ${noun} request is in`;
    case 'confirmed':
      return `Your ${noun} is confirmed`;
    case 'preparing':
      return `We are preparing your ${noun}`;
    case 'on_the_way':
      return o.service === 'pickup'
        ? `Your water is ready at ${stationById(o.stationId ?? '')?.name ?? 'the branch'}`
        : `Your ${noun} is on the way`;
    default:
      return `Your ${noun} is ${statusLabel(o.service, o.status).toLowerCase()}`;
  }
}

const startMs = (o: Order) => fromIso(o.date, o.start).getTime();
export const bySoonest = (a: Order, b: Order) => startMs(a) - startMs(b);
export const byLatest = (a: Order, b: Order) => startMs(b) - startMs(a);

export const nextOrder = (orders: Order[]) => orders.filter((o) => !isClosed(o)).sort(bySoonest)[0];

/* ---------- Validation ---------- */

export const PHONE_LENGTH = 11;

/** Digits only, in the local 09XXXXXXXXX form. A +63 or 63 prefix becomes 0. */
export function normalizePhone(s: string) {
  const digits = s.replace(/\D/g, '');
  // No local mobile number starts with 63, so it is always the country code.
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
}
export const isValidPhone = (s: string) => /^09\d{9}$/.test(normalizePhone(s));
export const PHONE_HELP = 'Enter an 11-digit mobile number starting with 09, like 09171234567.';

/** For typing: digits only, and it stops at 11 so the count can not run over. */
export const formatPhoneInput = (s: string) => normalizePhone(s).slice(0, PHONE_LENGTH);

export interface AddressFields {
  house: string;
  street: string;
  barangay: string;
  city: string;
}

export const EMPTY_ADDRESS: AddressFields = { house: '', street: '', barangay: '', city: '' };

export const formatAddress = (a: AddressFields) =>
  `${a.house.trim()} ${a.street.trim()}, Brgy. ${a.barangay.trim().replace(/^(brgy\.?|barangay)\s+/i, '')}, ${a.city}`;

export type AddressErrors = Partial<Record<keyof AddressFields, string>>;

export function validateAddress(a: AddressFields): AddressErrors {
  const errors: AddressErrors = {};
  if (!a.house.trim()) errors.house = 'Enter your house or unit number.';
  if (a.street.trim().length < 2) errors.street = 'Enter your street.';
  if (a.barangay.trim().length < 2) errors.barangay = 'Enter your barangay.';
  if (!CITIES.includes(a.city)) errors.city = 'Choose your city.';
  return errors;
}

export const hasAnyAddress = (a?: AddressFields) => !!a && Object.values(a).some((v) => v.trim());

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  privacyAccepted: boolean;
  /** Optional. If any part is filled in, all of it is needed. It becomes the saved delivery address. */
  address?: AddressFields;
}

export type RegisterErrors = Partial<Record<keyof RegisterInput | 'confirm' | keyof AddressFields, string>>;

export const PASSWORD_HELP = 'At least 10 characters with upper and lower case letters, a number and a symbol.';

const COMMON_PASSWORDS = ['password', 'qwerty', '12345678', 'letmein', 'welcome', 'iloveyou', 'admin123', 'akwa'];

/** Returns what is wrong with a password, or null when it is strong enough. */
export function passwordProblem(password: string, who: { email?: string; name?: string } = {}): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter.';
  if (!/\d/.test(password)) return 'Add a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add a symbol, like ! or #.';
  if (/\s/.test(password)) return 'Remove the spaces.';
  if (/(.)\1{2,}/.test(password)) return 'Avoid repeating the same character three times in a row.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.some((w) => lower.includes(w))) return 'That password is too easy to guess. Avoid common words.';
  const local = who.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Do not use your email in your password.';
  return null;
}

export function validateRegistration(input: RegisterInput, confirm: string): RegisterErrors {
  const errors: RegisterErrors = {};
  if (!input.name.trim()) errors.name = 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = 'Enter an email address like name@example.com.';
  if (!isValidPhone(input.phone)) errors.phone = PHONE_HELP;
  const weak = passwordProblem(input.password, input);
  if (weak) errors.password = weak;
  if (confirm !== input.password) errors.confirm = 'These passwords do not match.';
  if (hasAnyAddress(input.address)) Object.assign(errors, validateAddress(input.address!));
  if (!input.privacyAccepted) errors.privacyAccepted = 'Read and accept the privacy notice to continue.';
  return errors;
}

/* ---------- Calendar export ---------- */

export function toIcs(o: Order) {
  const stamp = (hour: number) => `${o.date.replaceAll('-', '')}T${pad(hour)}0000`;
  const station = stationById(o.stationId ?? '');
  const location = (o.service === 'pickup' ? station?.area : o.address) ?? '';
  const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Akwa//Order//EN',
    'BEGIN:VEVENT',
    `UID:${o.id}@akwa`,
    `DTSTAMP:${new Date(o.createdAt).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(o.start + WINDOW_HOURS)}`,
    `SUMMARY:${escape(`Akwa: ${serviceById(o.service).name}`)}`,
    `LOCATION:${escape(location)}`,
    `DESCRIPTION:${escape(`Order ${o.ref}. ${gallonsLabel(o.gallons)}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
