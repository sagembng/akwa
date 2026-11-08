import { useEffect, useId, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarX2,
  Check,
  CircleCheck,
  Clock,
  Droplets,
  Eye,
  EyeOff,
  LogOut,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import {
  dayState,
  directionsUrl,
  formatWindow,
  fromIso,
  mapEmbedUrl,
  MAX_GALLONS,
  ORDER_FLOW,
  stageOf,
  statusLabel,
  type Availability,
  type Order,
  type OrderStatus,
  type ServiceId,
  type Station,
} from './data';
import { logout, navigate, type Session } from './store';

export const ICON_STROKE = 1.75;

/** Horizontal lockup from the brand kit, inlined so it renders in Plus Jakarta Sans. */
export function Wordmark({ height = 44 }: { height?: number }) {
  const gradient = useId();
  return (
    <svg className="wordmark" width={height * 4} height={height} viewBox="0 0 800 200" role="img" aria-label="Akwa">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#BCEFF5" />
          <stop offset="1" stopColor="#21C7D9" />
        </linearGradient>
      </defs>
      <g transform="translate(20 20)">
        <rect width="160" height="160" rx="40" fill="#0F3D56" />
        <path d="M80 30 34 138h25l9-23h24l9 23h25L80 30Zm0 37 8 29H72l8-29Z" fill="#FFFFFF" />
        <path
          d="M116 49c-12 15-19 27-19 39 0 14 9 25 22 25s22-11 22-25c0-12-7-24-19-39a4 4 0 0 0-6 0Z"
          fill={`url(#${gradient})`}
        />
      </g>
      <text x="222" y="132" fill="#0F3D56" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontSize="108" fontWeight="700" letterSpacing="-5">
        Akwa
      </text>
    </svg>
  );
}

/** A gallon container whose water rises when it is added to the order. */
export function Gallon({ full }: { full: boolean }) {
  const clip = useId();
  const body = 'M10 3h8v5c0 1.2 1 2 2.2 2.6C23 12 24 14 24 17v17c0 2.2-1.8 4-4 4H8c-2.2 0-4-1.8-4-4V17c0-3 1-5 3.8-6.4C9 10 10 9.2 10 8V3Z';
  return (
    <svg className="gallon" data-full={full} viewBox="0 0 28 40" width="28" height="40" aria-hidden="true">
      <clipPath id={clip}>
        <path d={body} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect className="gallon-water" x="0" y="8" width="28" height="32" />
      </g>
      <path d={body} className="gallon-shell" />
    </svg>
  );
}

export function GallonRow({ count, max = MAX_GALLONS }: { count: number; max?: number }) {
  return (
    <div className="gallon-row" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <Gallon key={i} full={i < count} />
      ))}
    </div>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label="Number of gallons">
      <button type="button" className="stepper-btn" aria-label="Remove a gallon" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus size={20} strokeWidth={ICON_STROKE} />
      </button>
      <output className="stepper-value" aria-live="polite">
        {value}
      </output>
      <button type="button" className="stepper-btn" aria-label="Add a gallon" disabled={value >= MAX_GALLONS} onClick={() => onChange(value + 1)}>
        <Plus size={20} strokeWidth={ICON_STROKE} />
      </button>
    </div>
  );
}

const slotNote = (state: string, left: number) => {
  if (state === 'passed') return 'Closed';
  if (state === 'full') return 'Full';
  return left <= 2 ? `${left} left` : 'Open';
};

export function TimePicker(props: {
  availability: { days: Availability | null; error: boolean; reload: () => void };
  date: string | null;
  start: number | null;
  error?: string;
  onDate: (date: string) => void;
  onStart: (start: number) => void;
}) {
  const { availability, date, start, error, onDate, onStart } = props;
  const name = useId();

  if (!availability.days) {
    if (availability.error) {
      return (
        <div className="picker-state" role="alert">
          <p>We could not load the open times.</p>
          <button type="button" className="btn btn-quiet" onClick={availability.reload}>
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="picker" role="status" aria-label="Loading open times">
        <div className="day-strip" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="day day-loading" />
          ))}
        </div>
      </div>
    );
  }

  const availableDays = availability.days;
  const days = Object.keys(availableDays).sort();
  const slots = date ? availableDays[date] ?? [] : [];

  return (
    <div className="picker">
      <fieldset>
        <legend>Day</legend>
        <div className="day-strip">
          {days.map((iso) => {
            const d = fromIso(iso);
            const state = dayState(availableDays[iso]);
            const weekday = d.toLocaleDateString('en-PH', { weekday: 'short' });
            const month = d.toLocaleDateString('en-PH', { month: 'short' });
            return (
              <label key={iso} className="day" data-state={state}>
                <input
                  type="radio"
                  className="visually-hidden"
                  name={`${name}-day`}
                  checked={date === iso}
                  disabled={state !== 'open'}
                  onChange={() => onDate(iso)}
                  aria-label={`${weekday}, ${month} ${d.getDate()}${state === 'open' ? '' : `, ${state}`}`}
                />
                <span className="day-week">{weekday}</span>
                <span className="day-num">{d.getDate()}</span>
                <span className="day-note">{state === 'open' ? month : state === 'full' ? 'Full' : 'Closed'}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Time window</legend>
        {date ? (
          <div className="slot-grid" key={date}>
            {slots.map((s) => (
              <label key={s.start} className="slot" data-state={s.state}>
                <input
                  type="radio"
                  className="visually-hidden"
                  name={`${name}-slot`}
                  checked={start === s.start}
                  disabled={s.state !== 'open'}
                  onChange={() => onStart(s.start)}
                />
                <span className="slot-time">{formatWindow(s.start)}</span>
                <span className="slot-note">{slotNote(s.state, s.left)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">No open windows in the next two weeks.</p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </div>
  );
}

export function StatusTrack({ service, status }: { service: ServiceId; status: OrderStatus }) {
  const stage = stageOf(status);
  return (
    <ol className="track" style={{ '--progress': stage / (ORDER_FLOW.length - 1), '--n': ORDER_FLOW.length } as React.CSSProperties}>
      {ORDER_FLOW.map((step, i) => (
        <li key={step} data-state={i < stage ? 'done' : i === stage ? 'current' : 'todo'} aria-current={i === stage ? 'step' : undefined}>
          <span className="track-dot">{i < stage && <Check size={12} strokeWidth={3} aria-hidden="true" />}</span>
          <span className="track-label">{statusLabel(service, step)}</span>
        </li>
      ))}
    </ol>
  );
}

const PILL: Record<OrderStatus, { icon: LucideIcon; tone: string }> = {
  requested: { icon: Clock, tone: 'info' },
  confirmed: { icon: CalendarCheck, tone: 'info' },
  preparing: { icon: Droplets, tone: 'info' },
  on_the_way: { icon: Truck, tone: 'info' },
  delivered: { icon: CircleCheck, tone: 'success' },
  cancelled: { icon: CalendarX2, tone: 'error' },
};

export function StatusPill({ order }: { order: Order }) {
  const { icon, tone } = PILL[order.status];
  const Icon = order.service === 'pickup' && order.status === 'on_the_way' ? MapPin : icon;
  return (
    <span className="pill" data-tone={tone}>
      <Icon size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
      {statusLabel(order.service, order.status)}
    </span>
  );
}

export function DirectionsLink({ station, className = 'btn btn-quiet' }: { station: Station; className?: string }) {
  return (
    <a className={className} href={directionsUrl(station)} target="_blank" rel="noreferrer">
      <Navigation size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
      Get directions
      <span className="visually-hidden"> to {station.name}, opens Google Maps</span>
    </a>
  );
}

/** Google Maps with a pin on the branch. The name and directions stay usable if the map is blocked. */
export function StationMap({ station, compact = false }: { station: Station; compact?: boolean }) {
  const [loaded, setLoaded] = useState('');
  return (
    <figure className="map" data-compact={compact}>
      <div className="map-frame" data-loaded={loaded === station.id}>
        <iframe
          src={mapEmbedUrl(station)}
          title={`Google Map with a pin on ${station.name}, ${station.area}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoaded(station.id)}
        />
      </div>
      <figcaption className="map-bar">
        <span className="map-place">
          <span className="map-name">{station.name}</span>
          <span className="map-area">{station.area}</span>
        </span>
        <DirectionsLink station={station} className="btn btn-primary btn-small" />
      </figcaption>
    </figure>
  );
}

export function PasswordField(props: {
  id: string;
  name: string;
  value: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password">
      <input
        id={props.id}
        name={props.name}
        type={shown ? 'text' : 'password'}
        value={props.value}
        autoComplete={props.autoComplete}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button type="button" className="password-toggle" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? <EyeOff size={20} strokeWidth={ICON_STROKE} /> : <Eye size={20} strokeWidth={ICON_STROKE} />}
      </button>
    </div>
  );
}

export function AccountMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        ref={buttonRef}
        className="account-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu for ${session.name}`}
        onClick={() => setOpen(!open)}
      >
        {session.name.trim().charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="account-menu">
          <p className="account-name">{session.name}</p>
          <p className="account-email">{session.email}</p>
          <button
            type="button"
            className="btn btn-quiet btn-block"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
