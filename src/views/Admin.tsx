import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, ImageIcon, MapPinned, Phone, X } from 'lucide-react';
import {
  addressMapUrl,
  adminActionLabel,
  byLatest,
  bySoonest,
  formatDay,
  formatMoney,
  formatWindow,
  gallonsLabel,
  isClosed,
  isWallet,
  isOverdue,
  nextStatus,
  previousStatus,
  serviceById,
  stationById,
  paymentMethodLabel,
  paymentStatusLabel,
  statusLabel,
  waterTypeName,
  type Order,
  type OrderStatus,
} from '../data';
import { ICON_STROKE, StatusPill } from '../components';
import { ApiError, decidePayment, fetchProof, setOrderStatus, showToast, useNow, useOrders, useOrdersLoaded, useSession } from '../store';

type Filter = 'active' | OrderStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'All active' },
  { id: 'requested', label: 'Requested' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'on_the_way', label: 'On the way' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function Admin() {
  const session = useSession();
  const branch = stationById(session?.kind === 'admin' ? session.branchId : '');
  const orders = useOrders();
  const loaded = useOrdersLoaded();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('active');

  const matches = (o: Order, f: Filter) => (f === 'active' ? !isClosed(o) : o.status === f);
  const shown = orders.filter((o) => matches(o, filter)).sort(filter === 'delivered' || filter === 'cancelled' ? byLatest : bySoonest);

  return (
    <div className="wrap admin">
      <h1>Orders</h1>
      {branch && (
        <p className="muted admin-branch">
          {branch.name} · {branch.area}. You only see orders for this branch.
        </p>
      )}

      <fieldset className="filters">
        <legend className="visually-hidden">Filter orders by status</legend>
        {FILTERS.map((f) => (
          <label key={f.id} className="filter">
            <input type="radio" name="order-filter" className="visually-hidden" checked={filter === f.id} onChange={() => setFilter(f.id)} />
            {f.label}
            <span className="filter-count">{orders.filter((o) => matches(o, f.id)).length}</span>
          </label>
        ))}
      </fieldset>

      {!loaded ? (
        <p className="muted" role="status">
          Loading orders…
        </p>
      ) : shown.length === 0 ? (
        <div className="empty panel">
          <h2>{filter === 'active' ? 'No active orders' : `No ${FILTERS.find((f) => f.id === filter)!.label.toLowerCase()} orders`}</h2>
          <p className="muted">New customer requests show up here as soon as they are sent.</p>
        </div>
      ) : (
        <ul className="order-board">
          {shown.map((o) => (
            <OrderRow key={o.id} order={o} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shows the customer's receipt and lets the branch verify or reject it before confirming. */
function PaymentCheck({ order }: { order: Order }) {
  const [proof, setProof] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = order.payment.status;

  const view = async () => {
    if (proof) return setProof(null);
    setLoading(true);
    try {
      setProof(await fetchProof(order.id));
    } catch (error) {
      showToast((error as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  const decide = async (decision: 'verify' | 'reject') => {
    setBusy(true);
    try {
      await decidePayment(order.id, decision);
      showToast(decision === 'verify' ? `Payment verified. You can now confirm ${order.ref}.` : `Payment rejected. ${order.name} was asked for a new receipt.`);
    } catch (error) {
      showToast((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="payment-check">
      <p className="payment-check-title">
        {status === 'paid' && <BadgeCheck size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />}
        {paymentMethodLabel(order.payment)} payment · {paymentStatusLabel(order.payment)} · <span className="num">{formatMoney(order.total)}</span>
      </p>
      {status === 'rejected' && <p className="muted">Waiting for {order.name} to send a new receipt.</p>}
      <div className="booking-actions">
        {order.payment.hasProof && (
          <button type="button" className="btn btn-quiet" disabled={loading} onClick={view}>
            <ImageIcon size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            {loading ? 'Loading…' : proof ? 'Hide receipt' : 'View receipt'}
          </button>
        )}
        {status === 'review' && (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide('verify')}>
              Verify payment
            </button>
            <button type="button" className="btn btn-text-danger" disabled={busy} onClick={() => decide('reject')}>
              <X size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
              Reject
            </button>
          </>
        )}
      </div>
      {proof && <img className="proof-preview proof-large" src={proof} alt={`Receipt uploaded by ${order.name}`} />}
    </div>
  );
}

function OrderRow({ order, now }: { order: Order; now: Date }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const next = nextStatus(order.status);
  const previous = previousStatus(order.status);
  const station = stationById(order.stationId ?? '');
  const closed = isClosed(order);
  const needsVerification = isWallet(order.payment.method) && order.payment.status !== 'paid' && !closed;

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const move = async (status: OrderStatus) => {
    setBusy(true);
    try {
      const updated = await setOrderStatus(order.id, status);
      const refunded = updated.payment.status === 'refunded' && order.payment.status !== 'refunded';
      showToast(`${order.ref} is now ${statusLabel(order.service, status).toLowerCase()}.${refunded ? ' Payment refunded.' : ''}`);
    } catch (error) {
      showToast((error as ApiError).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="order-row panel">
      <div className="order-main">
        <div className="order-who">
          <h2 className="order-name">{order.name}</h2>
          <p className="muted num order-ref">{order.ref}</p>
          <a className="order-link" href={`tel:${order.phone}`}>
            <Phone size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
            {order.phone}
          </a>
        </div>

        <div className="order-what">
          <p className="order-strong">{serviceById(order.service).name}</p>
          <p className="muted">
            {gallonsLabel(order.gallons)} · {waterTypeName(order.waterType)} · <span className="num">{formatMoney(order.total)}</span>
          </p>
          <p className="muted">
            {paymentStatusLabel(order.payment)} · {paymentMethodLabel(order.payment, order.service)}
          </p>
          {station ? (
            <p className="muted">{station.name}</p>
          ) : (
            <a className="order-link" href={addressMapUrl(order.address ?? '')} target="_blank" rel="noreferrer">
              <MapPinned size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {order.address}
              <span className="visually-hidden">, opens Google Maps</span>
            </a>
          )}
          {order.note && <p className="order-note">Note: {order.note}</p>}
        </div>

        <div className="order-when">
          <p className="order-strong">{formatDay(order.date)}</p>
          <p className="muted num">{formatWindow(order.start)}</p>
          {isOverdue(order, now) && (
            <p className="order-overdue">
              <AlertTriangle size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
              Window has passed
            </p>
          )}
        </div>

        <div className="order-status">
          <StatusPill order={order} />
        </div>
      </div>

      {isWallet(order.payment.method) && !closed && <PaymentCheck order={order} />}

      {confirming ? (
        <div className="cancel-confirm" role="group" aria-label="Confirm cancellation">
          <p>
            Cancel {order.ref}? {order.name} will see it as cancelled.{order.payment.status === 'paid' ? ` Their ${formatMoney(order.total)} payment will be refunded.` : ''}
          </p>
          <div className="booking-actions">
            <button type="button" ref={keepRef} className="btn btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>
              Keep order
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => move('cancelled')}>
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          </div>
        </div>
      ) : (
        <div className="order-actions">
          {next && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (next === 'confirmed' && needsVerification)}
              title={next === 'confirmed' && needsVerification ? 'Verify the payment first' : undefined}
              onClick={() => move(next)}
            >
              {adminActionLabel(order.service, next)}
            </button>
          )}
          {previous && (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => move(previous)}>
              Back to {statusLabel(order.service, previous).toLowerCase()}
            </button>
          )}
          {order.status === 'cancelled' && order.payment.status !== 'refunded' && (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => move('requested')}>
              Reopen order
            </button>
          )}
          {!closed && (
            <button type="button" className="btn btn-text-danger" onClick={() => setConfirming(true)}>
              Cancel
            </button>
          )}
        </div>
      )}
    </li>
  );
}
