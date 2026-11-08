import { useState } from 'react';
import { ArrowRight, MapPin, RefreshCw, Truck, type LucideIcon } from 'lucide-react';
import {
  firstOpen,
  formatDay,
  formatMoney,
  formatWindow,
  gallonsLabel,
  nextOrder,
  SERVICES,
  serviceById,
  stationById,
  stationOpenNow,
  STATIONS,
  statusHeadline,
  type Order,
  type ServiceId,
} from '../data';
import { DirectionsLink, ICON_STROKE, StationMap, StatusTrack } from '../components';
import { navigate, useAvailability, useNow, useOrders } from '../store';

export const SERVICE_ICONS: Record<ServiceId, LucideIcon> = { delivery: Truck, swap: RefreshCw, pickup: MapPin };

// The hero's water rises once per visit, not every time someone comes back to Home.
let heroPlayed = false;

export default function Home({ user }: { user: { id: string } | null }) {
  const orders = useOrders();
  const now = useNow();
  const [service, setService] = useState<ServiceId>('swap');
  const [stationId, setStationId] = useState(STATIONS[0].id);
  const [animate] = useState(() => {
    const play = !heroPlayed;
    heroPlayed = true;
    return play;
  });

  const availability = useAvailability('route');
  const next = user ? nextOrder(orders) : undefined;
  const open = availability.days ? firstOpen(availability.days) : null;
  const station = stationById(stationId)!;

  return (
    <>
      <section className="hero on-navy" data-animate={animate}>
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">{next ? <NextUp order={next} /> : <Welcome open={open} />}</div>

          <form
            className="panel hero-panel"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/book?service=${service}`);
            }}
          >
            <h2>{next ? 'Need more water?' : 'What do you need?'}</h2>
            <fieldset className="service-list">
              <legend className="visually-hidden">Service</legend>
              {SERVICES.map((s) => {
                const Icon = SERVICE_ICONS[s.id];
                return (
                  <label key={s.id} className="choice">
                    <input
                      type="radio"
                      name="home-service"
                      className="visually-hidden"
                      checked={service === s.id}
                      onChange={() => setService(s.id)}
                    />
                    <span className="choice-icon">
                      <Icon size={22} strokeWidth={ICON_STROKE} aria-hidden="true" />
                    </span>
                    <span className="choice-text">
                      <span className="choice-title">{s.name}{s.tag && <span className="choice-tag">{s.tag}</span>}</span>
                      <span className="choice-sub">{s.summary}</span>
                    </span>
                    <span className="choice-price">
                      {formatMoney(s.pricePerGallon)}
                      <span className="choice-unit">per gallon</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <button className="btn btn-primary btn-block" type="submit">
              {serviceById(service).action}
              <ArrowRight className="btn-arrow" size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </button>
          </form>
        </div>
        <svg className="hero-water" viewBox="0 0 2880 200" preserveAspectRatio="none" aria-hidden="true">
          <path className="wave-back" d="M0 80Q360 20 720 80T1440 80T2160 80T2880 80V200H0Z" />
          <path className="wave-front" d="M0 130Q360 185 720 130T1440 130T2160 130T2880 130V200H0Z" />
        </svg>
      </section>

      <section className="stations" aria-labelledby="stations-title">
        <div className="wrap">
          <div className="stations-head">
            <h2 id="stations-title">Akwa water stations</h2>
            <p className="muted">Delivery and swaps run Monday to Saturday, 8 AM to 6 PM. The delivery fee depends on how far you are from the branch.</p>
          </div>
          <div className="stations-grid">
            <StationMap station={station} />
            <fieldset className="station-list">
              <legend className="visually-hidden">Choose a branch to show on the map</legend>
              {STATIONS.map((s) => {
                const status = stationOpenNow(s, now);
                return (
                  <div key={s.id} className="station-row" data-selected={s.id === stationId}>
                    <label className="station-pick">
                      <input type="radio" name="map-station" className="visually-hidden" checked={s.id === stationId} onChange={() => setStationId(s.id)} />
                      <span className="station-name">{s.name}</span>
                      <span className="muted station-area">{s.area}</span>
                      <span className="open-state" data-open={status.open}>
                        <span className="open-dot" aria-hidden="true" />
                        {status.label}
                      </span>
                      <span className="muted station-hours">{s.hours}</span>
                    </label>
                    <div className="station-actions">
                      <a className="btn btn-quiet" href={`#/book?service=pickup&station=${s.id}`}>
                        Reserve a pickup
                      </a>
                      <DirectionsLink station={s} />
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </div>
        </div>
      </section>
    </>
  );
}

function Welcome({ open }: { open: { date: string; start: number } | null }) {
  const from = Math.min(...SERVICES.map((s) => s.pricePerGallon));
  return (
    <>
      <h1 className="display">Order water delivery or pick up at a station</h1>
      <p className="hero-lead">Purified water from {formatMoney(from)} per gallon, across Metro Manila. Pick a time window and we will confirm it.</p>
      {open && (
        <p className="hero-fact">
          <span className="hero-fact-label">Next open delivery window</span>
          <span className="hero-fact-value">
            {formatDay(open.date)} · {formatWindow(open.start)}
          </span>
        </p>
      )}
    </>
  );
}

function NextUp({ order }: { order: Order }) {
  const place = order.service === 'pickup' ? stationById(order.stationId ?? '')?.name : order.address;
  return (
    <>
      <h1 className="display">{statusHeadline(order)}</h1>
      <p className="hero-when">
        {formatDay(order.date)} · {formatWindow(order.start)}
      </p>
      <p className="hero-lead">
        {gallonsLabel(order.gallons)}
        {place ? `, ${place}` : ''}
      </p>
      <StatusTrack service={order.service} status={order.status} />
      <a className="text-link hero-manage" href="#/orders">
        Manage this order
      </a>
    </>
  );
}
