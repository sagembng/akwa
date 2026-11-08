import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  byLatest,
  bySoonest,
  canChange,
  formatDay,
  formatMoney,
  formatWindow,
  gallonsLabel,
  isClosed,
  paymentMethodLabel,
  paymentStatusLabel,
  REWARD_EVERY,
  rewardStatus,
  serviceById,
  waterTypeName,
  stationById,
  whereOf,
  type Order,
} from '../data';
import { DirectionsLink, ICON_STROKE, StatusPill, StatusTrack, TimePicker } from '../components';
import { ApiError, cancelOrder, changeOrderTime, showToast, uploadProof, useAvailability, useNow, useOrders, useOrdersLoaded } from '../store';
import { ProofUpload } from './Payment';

export default function Orders() {
  const mine = useOrders();
  const loaded = useOrdersLoaded();
  const now = useNow();
  const [changing, setChanging] = useState<Order | null>(null);

  const upcoming = mine.filter((o) => !isClosed(o)).sort(bySoonest);
  const past = mine.filter(isClosed).sort(byLatest);

  return (
    <div className="wrap bookings">
      <h1>My orders</h1>
      {loaded && <RewardCard orders={mine} />}

      {!loaded ? (
        <p className="muted" role="status">
          Loading your orders…
        </p>
      ) : mine.length === 0 ? (
        <div className="empty panel">
          <h2>No orders yet</h2>
          <p className="muted">Request a refill and it will show up here with its time and status.</p>
          <a className="btn btn-primary" href="#/book">
            Request a refill
          </a>
        </div>
      ) : (
        <>
          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="visually-hidden">
              Active orders
            </h2>
            {upcoming.length === 0 ? (
              <div className="empty panel">
                <h3>Nothing active</h3>
                <a className="btn btn-primary" href="#/book">
                  Request a refill
                </a>
              </div>
            ) : (
              <ul className="booking-list">
                {upcoming.map((o) => (
                  <OrderCard key={o.id} order={o} now={now} onChange={() => setChanging(o)} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="past" aria-labelledby="past-title">
              <h2 id="past-title">Past orders</h2>
              <ul className="past-list">
                {past.map((o) => {
                  const stationParam = o.stationId ? `&station=${o.stationId}` : '';
                  return (
                    <li key={o.id} className="past-row">
                      <div className="past-main">
                        <p className="past-title">
                          {formatDay(o.date)} · {serviceById(o.service).name}
                        </p>
                        <p className="muted">
                          {gallonsLabel(o.gallons)} · {formatMoney(o.total)} · {paymentStatusLabel(o.payment)} · {o.ref}
                        </p>
                      </div>
                      <StatusPill order={o} />
                      <a className="btn btn-quiet" href={`#/book?service=${o.service}&gallons=${o.gallons}${stationParam}`}>
                        Order again
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {changing && <ChangeTime order={changing} onClose={() => setChanging(null)} />}
    </div>
  );
}

/** Shown when the branch could not verify the receipt. */
/** Progress toward the free gallon given for every 12 completed orders. */
function RewardCard({ orders }: { orders: Order[] }) {
  const { available, progress, toNext } = rewardStatus(orders);
  return (
    <section className="panel reward" aria-label="Free gallon bonus">
      <div>
        <h2 className="label-title">{available > 0 ? `You have ${available} free ${available === 1 ? 'gallon' : 'gallons'}` : 'Free gallon bonus'}</h2>
        <p className="muted">
          {available > 0
            ? 'It comes off your next order automatically.'
            : `Every ${REWARD_EVERY} completed orders earns 1 free gallon. ${toNext} more to go.`}
        </p>
      </div>
      <div className="reward-meter" role="img" aria-label={`${progress} of ${REWARD_EVERY} orders completed`}>
        {Array.from({ length: REWARD_EVERY }, (_, i) => (
          <span key={i} data-on={i < progress ? 'true' : undefined} />
        ))}
      </div>
    </section>
  );
}

function ResendReceipt({ order }: { order: Order }) {
  const [proof, setProof] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!proof) return setError('Attach a new screenshot first.');
    setBusy(true);
    try {
      await uploadProof(order.id, proof);
      showToast('New receipt sent. Your branch will check it.');
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="resend">
      <p className="pay-error" role="alert">
        Your branch could not verify this payment. Check that you sent {formatMoney(order.total)} to the right QR code, then attach a clear screenshot of the receipt.
      </p>
      <ProofUpload proof={proof} onProof={(p) => { setProof(p); setError(undefined); }} error={error} label="New receipt screenshot" />
      <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
        {busy ? 'Sending…' : 'Send new receipt'}
      </button>
    </div>
  );
}

function OrderCard({ order, now, onChange }: { order: Order; now: Date; onChange: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const service = serviceById(order.service);
  const isPickup = order.service === 'pickup';
  const station = stationById(order.stationId ?? '');
  const paid = order.payment.status === 'paid';

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) cancelRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const editable = canChange(order, now);

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelOrder(order.id);
      showToast(paid ? 'Order cancelled. Your payment was refunded.' : 'Order cancelled.');
    } catch (error) {
      setBusy(false);
      setConfirming(false);
      showToast((error as ApiError).message);
    }
  };

  return (
    <li className="booking panel">
      <div className="booking-head">
        <div>
          <h3 className="booking-when">{formatDay(order.date)}</h3>
          <p className="booking-window num">{formatWindow(order.start)}</p>
        </div>
        <StatusPill order={order} />
      </div>

      <StatusTrack service={order.service} status={order.status} />

      <dl className="booking-facts">
        <div>
          <dt>Service</dt>
          <dd>
            {service.name}, {gallonsLabel(order.gallons)}, {waterTypeName(order.waterType)}{order.freeGallon ? ' (1 free)' : ''}
          </dd>
        </div>
        <div>
          <dt>{isPickup ? 'Branch' : 'Address'}</dt>
          <dd>{isPickup ? `${station?.name}, ${station?.area}` : order.address}</dd>
        </div>
        {order.note && (
          <div>
            <dt>Note</dt>
            <dd>{order.note}</dd>
          </div>
        )}
        <div>
          <dt>Total</dt>
          <dd className="num">{formatMoney(order.total)}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {paymentStatusLabel(order.payment)}, {paymentMethodLabel(order.payment, order.service)}
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd className="num">{order.ref}</dd>
        </div>
      </dl>

      {order.status === 'confirmed' && (
        <p className="pay-note">Confirmed by the branch, so it can no longer be changed or cancelled. Contact the branch if you need help.</p>
      )}
      {order.payment.status === 'review' && (
        <p className="pay-note" role="status">
          Receipt received. Your branch is checking your payment and will confirm the order after.
        </p>
      )}
      {order.payment.status === 'rejected' && !isClosed(order) && <ResendReceipt order={order} />}

      {confirming && editable ? (
        <div className="cancel-confirm" role="group" aria-label="Confirm cancellation">
          <p>{paid ? `Cancel this order? Your ${formatMoney(order.total)} payment will be refunded.` : 'Cancel this order? The time goes back to other customers.'}</p>
          <div className="booking-actions">
            <button type="button" ref={keepRef} className="btn btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>
              Keep order
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={cancel}>
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          </div>
        </div>
      ) : (
        <div className="booking-actions">
          {isPickup && station && <DirectionsLink station={station} />}
          {editable && (
            <>
              <button type="button" className="btn btn-quiet" onClick={onChange}>
                Change time
              </button>
              <button type="button" ref={cancelRef} className="btn btn-text-danger" onClick={() => setConfirming(true)}>
                Cancel
              </button>
            </>
          )}
          {!editable && !isPickup && <p className="muted">We have started on this order, so it can no longer be changed.</p>}
        </div>
      )}
    </li>
  );
}

function ChangeTime({ order, onClose }: { order: Order; onClose: () => void }) {
  const availability = useAvailability(whereOf(order.service, order.stationId), order.id);
  const ref = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState<string | null>(order.date);
  const [start, setStart] = useState<number | null>(order.start);
  const [error, setError] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose();
    setClosing(true);
    setTimeout(onClose, 140);
  };

  const save = async () => {
    if (date === null || start === null) return setError('Pick a time window to continue.');
    if (date === order.date && start === order.start) return close();
    setBusy(true);
    try {
      await changeOrderTime(order.id, date, start);
      showToast(`Moved to ${formatDay(date)}, ${formatWindow(start)}. We will confirm the new time.`);
      close();
    } catch (e) {
      const apiError = e as ApiError;
      setBusy(false);
      setError(apiError.message);
      if (apiError.code === 'window_unavailable') {
        setStart(null);
        void availability.reload();
      }
    }
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-closing={closing}
      aria-labelledby="change-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2 id="change-title">Change time</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <X size={22} strokeWidth={ICON_STROKE} />
          </button>
        </div>
        <p className="muted sheet-current">
          Now set for {formatDay(order.date)}, {formatWindow(order.start)}. A new time needs confirming again.
        </p>
        <TimePicker
          availability={availability}
          date={date}
          start={start}
          error={error}
          onDate={(d) => {
            setDate(d);
            setStart(null);
            setError(undefined);
          }}
          onStart={(s) => {
            setStart(s);
            setError(undefined);
          }}
        />
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={close}>
            Keep current time
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save new time'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
