import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  manilaNow,
  type AddressFields,
  type Availability,
  type Order,
  type OrderStatus,
  type RegisterErrors,
  type RegisterInput,
  type ServiceId,
  type WaterType,
} from './data';

export const DRAFT_KEY = 'akwa.draft.v2';
const ORDER_POLL_MS = 8_000;
const AVAILABILITY_POLL_MS = 30_000;

/* ---------- API client ---------- */

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
  }
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network', 'We could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error ?? {};
    if (res.status === 401 && error.code === 'not_logged_in') clearSession();
    throw new ApiError(res.status, error.code ?? 'server_error', error.message ?? 'Something went wrong on our side. Try again.', error.field);
  }
  return data as T;
}

/* ---------- Session ---------- */

export type SavedDetails = AddressFields;

export type Session =
  | { kind: 'admin'; id: string; name: string; email: string; branchId: string }
  | { kind: 'customer'; id: string; name: string; email: string; phone: string; saved: SavedDetails | null };

interface AccountResponse {
  user: { id: string; name: string; email: string; phone: string; role: 'customer' | 'admin'; branchId: string | null } | null;
  details: SavedDetails | null;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let session: Session | null = null;
let sessionReady = false;

function applyAccount({ user, details }: AccountResponse) {
  if (!user) session = null;
  else if (user.role === 'admin') session = { kind: 'admin', id: user.id, name: user.name, email: user.email, branchId: user.branchId ?? '' };
  else session = { kind: 'customer', id: user.id, name: user.name, email: user.email, phone: user.phone, saved: details };
  sessionReady = true;
  syncOrders();
  emit();
}

function clearSession() {
  session = null;
  syncOrders();
  emit();
}

export async function loadSession(attemptsLeft = 5) {
  try {
    applyAccount(await api<AccountResponse>('/api/me'));
  } catch {
    // The API can start a moment after the page, or a hosted database can be waking up.
    if (attemptsLeft > 0) {
      setTimeout(() => void loadSession(attemptsLeft - 1), 1000);
      return;
    }
    // Still unreachable: show the public pages, and forms will explain on use.
    sessionReady = true;
    emit();
  }
}

export const useSession = () => useSyncExternalStore(subscribe, () => session);
export const useSessionReady = () => useSyncExternalStore(subscribe, () => sessionReady);

export type LoginErrors = { email?: string; password?: string; form?: string };

export async function login(email: string, password: string): Promise<LoginErrors | null> {
  try {
    applyAccount(await api<AccountResponse>('/api/auth/login', { method: 'POST', body: { email, password } }));
    return null;
  } catch (error) {
    const e = error as ApiError;
    if (e.field === 'email' || e.field === 'password') return { [e.field]: e.message };
    return { form: e.message };
  }
}

export async function register(input: RegisterInput): Promise<RegisterErrors> {
  try {
    applyAccount(await api<AccountResponse>('/api/auth/register', { method: 'POST', body: input }));
    return {};
  } catch (error) {
    const e = error as ApiError;
    if (e.field) return { [e.field]: e.message };
    showToast(e.message);
    return { email: e.message };
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', body: {} });
  } catch {
    // Still end the session on this screen.
  }
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up.
  }
  clearSession();
}

/* ---------- Orders ---------- */

let orders: Order[] = [];
let ordersSnapshot = '[]';
let ordersLoaded = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;

function setOrders(next: Order[]) {
  const snapshot = JSON.stringify(next);
  ordersLoaded = true;
  if (snapshot !== ordersSnapshot) {
    orders = next;
    ordersSnapshot = snapshot;
  }
  emit();
}

async function fetchOrders() {
  if (!session || document.hidden) return;
  try {
    const { orders: next } = await api<{ orders: Order[] }>('/api/orders');
    setOrders(next);
  } catch {
    // A missed poll is harmless. The next one catches up.
  }
}

/** Starts or stops polling to match the session. Neon has no push updates, so this keeps two screens in step. */
function syncOrders() {
  clearInterval(pollTimer);
  pollTimer = undefined;
  if (!session) {
    orders = [];
    ordersSnapshot = '[]';
    ordersLoaded = false;
    return;
  }
  ordersLoaded = false;
  void fetchOrders();
  pollTimer = setInterval(fetchOrders, ORDER_POLL_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => void fetchOrders());
}

export const useOrders = () => useSyncExternalStore(subscribe, () => orders);
export const useOrdersLoaded = () => useSyncExternalStore(subscribe, () => ordersLoaded);

const replaceOrder = (order: Order) => {
  const found = orders.some((o) => o.id === order.id);
  setOrders(found ? orders.map((o) => (o.id === order.id ? order : o)) : [...orders, order]);
  return order;
};

export type PaymentInput =
  | { method: 'cash' }
  | { method: 'gcash' | 'maya'; proof: string }
  | { method: 'card'; last4: string };

export interface OrderInput {
  service: ServiceId;
  gallons: number;
  waterType: WaterType;
  stationId?: string;
  date: string;
  start: number;
  name: string;
  phone: string;
  house?: string;
  street?: string;
  barangay?: string;
  city?: string;
  note?: string;
  payment: PaymentInput;
}

export async function createOrder(input: OrderInput) {
  const { order } = await api<{ order: Order }>('/api/orders', { method: 'POST', body: input });
  if (session?.kind === 'customer' && input.house && input.street && input.barangay && input.city) {
    session = { ...session, saved: { house: input.house, street: input.street, barangay: input.barangay, city: input.city } };
  }
  return replaceOrder(order);
}

export const changeOrderTime = async (id: string, date: string, start: number) =>
  replaceOrder((await api<{ order: Order }>(`/api/orders/${id}/time`, { method: 'PATCH', body: { date, start } })).order);

export const cancelOrder = async (id: string) =>
  replaceOrder((await api<{ order: Order }>(`/api/orders/${id}/cancel`, { method: 'POST', body: {} })).order);

export const setOrderStatus = async (id: string, status: OrderStatus) =>
  replaceOrder((await api<{ order: Order }>(`/api/admin/orders/${id}/status`, { method: 'POST', body: { status } })).order);

/** Customer attaches (or replaces) the screenshot for a GCash or Maya payment. */
export const uploadProof = async (id: string, proof: string) =>
  replaceOrder((await api<{ order: Order }>(`/api/orders/${id}/proof`, { method: 'POST', body: { proof } })).order);

export const fetchProof = async (id: string) => (await api<{ proof: string }>(`/api/orders/${id}/proof`)).proof;

/** The branch admin accepts or rejects a payment proof. */
export const decidePayment = async (id: string, decision: 'verify' | 'reject') =>
  replaceOrder((await api<{ order: Order }>(`/api/admin/orders/${id}/payment`, { method: 'POST', body: { decision } })).order);

/**
 * Reads a chosen screenshot and shrinks it to a JPEG that fits the server limit, so a
 * phone photo of several megabytes still uploads quickly. Rejects non-images.
 */
export function readProofFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Attach a PNG, JPG or WebP screenshot.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('We could not read that image.'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('We could not read that image.'));
    };
    img.src = url;
  });
}

/* ---------- Availability ---------- */

export function useAvailability(where: string, excludeId?: string) {
  const [state, setState] = useState<{ key: string; days: Availability | null; error: boolean }>({ key: '', days: null, error: false });
  const key = `${where}|${excludeId ?? ''}`;

  const load = useCallback(async () => {
    const query = new URLSearchParams({ where });
    if (excludeId) query.set('exclude', excludeId);
    try {
      const { days } = await api<{ days: Availability }>(`/api/availability?${query}`);
      setState({ key, days, error: false });
    } catch {
      setState((current) => ({ ...current, key, error: true }));
    }
  }, [where, excludeId, key]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, AVAILABILITY_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const current = state.key === key;
  return { days: current ? state.days : null, error: current && state.error, reload: load };
}

/* ---------- Saved details ---------- */

export interface Details extends AddressFields {
  name: string;
  phone: string;
  note: string;
}

export const initialDetails = (user: { name: string; phone: string; saved: SavedDetails | null }): Details => ({
  name: user.name,
  phone: user.phone,
  house: user.saved?.house ?? '',
  street: user.saved?.street ?? '',
  barangay: user.saved?.barangay ?? '',
  city: user.saved?.city ?? '',
  note: '',
});

/** Current Manila time, refreshed so slots and statuses stay honest on an open tab. */
export function useNow() {
  const [now, setNow] = useState(manilaNow);
  useEffect(() => {
    const t = setInterval(() => setNow(manilaNow()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ---------- Hash routing ---------- */

export interface Route {
  path: string;
  params: URLSearchParams;
}

const parse = (): Route => {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  location.hash = to;
};

export const replaceRoute = (to: string) => {
  location.replace(`#${to}`);
};

/* ---------- Toast ---------- */

let toast: { id: number; text: string } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();

export function showToast(text: string) {
  toast = { id: Date.now(), text };
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    toastListeners.forEach((l) => l());
  }, 4000);
}

export const useToast = () =>
  useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toast,
  );
