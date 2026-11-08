import { useEffect, useRef } from 'react';
import { CalendarPlus, Check } from 'lucide-react';
import { formatDay, formatMoney, formatWindow, gallonsLabel, paymentMethodLabel, paymentStatusLabel, serviceById, stationById, toIcs, waterTypeName } from '../data';
import { ICON_STROKE, StationMap } from '../components';
import { useOrders, useOrdersLoaded } from '../store';

function downloadIcs(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Requested({ id }: { id: string }) {
  const orders = useOrders();
  const loaded = useOrdersLoaded();
  const order = orders.find((o) => o.id === id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [loaded]);

  if (!order) {
    if (!loaded) {
      return (
        <div className="wrap empty" role="status">
          <p className="muted">Loading your order…</p>
        </div>
      );
    }
    return (
      <div className="wrap empty">
        <h1 ref={headingRef} tabIndex={-1}>
          We can't find that order
        </h1>
        <p className="muted">It may belong to a different account.</p>
        <a className="btn btn-primary" href="#/orders">
          See my orders
        </a>
      </div>
    );
  }

  const service = serviceById(order.service);
  const isPickup = order.service === 'pickup';
  const station = stationById(order.stationId ?? '');
  const paid = order.payment.status === 'paid';

  return (
    <div className="wrap booked">
      <section className="booked-panel on-navy">
        <span className="booked-check" aria-hidden="true">
          <Check size={28} strokeWidth={2.5} />
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          Your {service.noun} request is in.
        </h1>
        <p className="booked-when">
          {formatDay(order.date)} · {formatWindow(order.start)}
        </p>
        <p className="booked-next">
          {order.payment.status === 'review'
            ? 'Your branch will check your receipt, then confirm your order. You can follow every update in My orders.'
            : 'We will confirm it soon. You can follow every update in My orders.'}
        </p>
        <div className="booked-water" aria-hidden="true">
          <svg viewBox="0 0 800 60" preserveAspectRatio="none">
            <path d="M0 30c130-30 260-30 400 0s270 30 400 0v30H0Z" />
          </svg>
        </div>
      </section>

      <section className="panel booked-details" aria-label="Order details">
        <dl className="summary-lines">
          <div>
            <dt>Reference</dt>
            <dd className="num">{order.ref}</dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>{service.name}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>
              {gallonsLabel(order.gallons)}, {waterTypeName(order.waterType)}
              {order.freeGallon ? ' (1 free gallon bonus)' : ''}
            </dd>
          </div>
          {!isPickup && (
            <div>
              <dt>Address</dt>
              <dd>{order.address}</dd>
            </div>
          )}
          <div>
            <dt>Payment</dt>
            <dd>{paymentMethodLabel(order.payment, order.service)}</dd>
          </div>
          <div>
            <dt>{paid ? 'Paid' : paymentStatusLabel(order.payment)}</dt>
            <dd className="num">{formatMoney(order.total)}</dd>
          </div>
          {paid && (
            <div>
              <dt>Receipt</dt>
              <dd className="num">{order.payment.reference}</dd>
            </div>
          )}
        </dl>
        {isPickup && station && <StationMap station={station} compact />}
        <p className="muted booked-note">
          You can change the time or cancel until the branch confirms your order.{paid ? ' Cancelling refunds your payment.' : ''}
        </p>
        <div className="booked-actions">
          <a className="btn btn-primary" href="#/orders">
            See my orders
          </a>
          <button type="button" className="btn btn-quiet" onClick={() => downloadIcs(`akwa-${order.ref}.ics`, toIcs(order))}>
            <CalendarPlus size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Add to calendar
          </button>
        </div>
      </section>
    </div>
  );
}
