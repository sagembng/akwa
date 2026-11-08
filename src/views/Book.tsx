import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  CITIES,
  deliveryDistanceKm,
  deliveryFee,
  firstOpen,
  formatDay,
  formatMoney,
  formatWindow,
  formatPhoneInput,
  gallonsLabel,
  isValidPhone,
  isWallet,
  MAX_GALLONS,
  PHONE_HELP,
  PHONE_LENGTH,
  rewardStatus,
  serviceById,
  SERVICES,
  stationById,
  STATIONS,
  total,
  unitPrice,
  validateAddress,
  WATER_TYPES,
  whereOf,
  type PaymentMethod,
  type ServiceId,
  type WaterType,
} from '../data';
import { GallonRow, ICON_STROKE, StationMap, Stepper, TimePicker } from '../components';
import { ApiError, createOrder, DRAFT_KEY, initialDetails, navigate, replaceRoute, useAvailability, useOrders, type Details, type PaymentInput, type SavedDetails } from '../store';
import { SERVICE_ICONS } from './Home';
import { cardLast4, EMPTY_CARD, PaymentStep, validateCard, type CardErrors, type CardFields } from './Payment';

const STEPS = ['Order', 'Time', 'Details', 'Payment'];

interface Draft {
  service: ServiceId;
  gallons: number;
  waterType: WaterType;
  stationId: string;
  date: string | null;
  start: number | null;
}

function initialDraft(params: URLSearchParams): Draft {
  const fallback: Draft = { service: 'swap', gallons: 1, waterType: 'purified', stationId: STATIONS[0].id, date: null, start: null };
  const service = params.get('service') as ServiceId | null;
  if (service && SERVICES.some((s) => s.id === service)) {
    const gallons = Number(params.get('gallons'));
    const station = params.get('station');
    return {
      ...fallback,
      service,
      gallons: gallons >= 1 && gallons <= MAX_GALLONS ? gallons : 1,
      stationId: station && stationById(station) ? station : fallback.stationId,
    };
  }
  try {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

type Errors = Partial<Record<keyof Details | 'time', string>>;

function validateDetails(d: Details, needsAddress: boolean): Errors {
  const errors: Errors = {};
  if (!d.name.trim()) errors.name = 'Enter your name so we know who to ask for.';
  if (!isValidPhone(d.phone)) errors.phone = PHONE_HELP;
  if (needsAddress) Object.assign(errors, validateAddress(d));
  return errors;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Book({ params, user }: { params: URLSearchParams; user: { id: string; name: string; phone: string; saved: SavedDetails | null } }) {
  const [draft, setDraft] = useState(() => initialDraft(params));
  const [details, setDetails] = useState<Details>(() => initialDetails(user));
  const [errors, setErrors] = useState<Errors>({});
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [payError, setPayError] = useState<string>();
  const [proof, setProof] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastStep = useRef(1);

  const service = serviceById(draft.service);
  const station = stationById(draft.stationId)!;
  const isPickup = draft.service === 'pickup';
  const where = whereOf(draft.service, draft.stationId);
  const availability = useAvailability(where);
  const city = isPickup ? undefined : details.city || undefined;
  const fee = deliveryFee(draft.service, draft.stationId, city);
  const distance = deliveryDistanceKm(draft.stationId, city);
  const reward = rewardStatus(useOrders());
  const free = reward.available > 0;
  const amount = total({ ...draft, city, free });
  const unit = unitPrice(draft.service, draft.waterType);
  const freeValue = free ? unit : 0;

  // A reload or pasted link can land past a step that has not been filled in.
  const rawStep = Math.min(Math.max(Number(params.get('step')) || 1, 1), STEPS.length);
  let step = rawStep;
  if (step >= 3 && draft.start === null) step = 2;
  else if (step === 4 && Object.keys(validateDetails(details, !isPickup)).length > 0) step = 3;
  const direction = step >= lastStep.current ? 'forward' : 'back';

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // The draft is a convenience; losing it on reload is acceptable.
    }
  }, [draft]);

  // Keep a selectable day in view whenever the place changes.
  useEffect(() => {
    if (draft.date || !availability.days) return;
    const open = firstOpen(availability.days);
    if (open) setDraft((d) => ({ ...d, date: open.date }));
  }, [draft.date, availability.days]);

  useEffect(() => {
    if (lastStep.current !== step) {
      window.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true });
      lastStep.current = step;
    }
  }, [step]);

  // A decline can appear below the fold, under the card form.
  useEffect(() => {
    if (payError) formRef.current?.querySelector('.pay-error')?.scrollIntoView({ block: 'nearest' });
  }, [payError]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      // A different place has different windows, so the earlier choice is void.
      const moved = whereOf(next.service, next.stationId) !== whereOf(d.service, d.stationId);
      return moved ? { ...next, date: null, start: null } : next;
    });
  };

  const goto = (n: number) => navigate(`/book?step=${n}`);

  const place = async (payment: PaymentInput) => {
    setBusy(true);
    setPayError(undefined);
    try {
      // A short pause so the mock payment reads as a real step.
      const [order] = await Promise.all([
        createOrder({
          service: draft.service,
          gallons: draft.gallons,
          waterType: draft.waterType,
          stationId: draft.stationId,
          date: draft.date!,
          start: draft.start!,
          name: details.name.trim(),
          phone: details.phone,
          house: isPickup ? undefined : details.house.trim(),
          street: isPickup ? undefined : details.street.trim(),
          barangay: isPickup ? undefined : details.barangay.trim(),
          city: isPickup ? undefined : details.city,
          note: isPickup ? undefined : details.note.trim() || undefined,
          payment,
        }),
        payment.method === 'card' ? wait(700) : null,
      ]);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up.
      }
      replaceRoute(`/requested/${order.id}`);
    } catch (error) {
      const e = error as ApiError;
      setBusy(false);
      if (e.code === 'window_unavailable') {
        setDraft((d) => ({ ...d, start: null }));
        setErrors({ time: e.message });
        void availability.reload();
        goto(2);
      } else if (e.field === 'proof') {
        setProofError(e.message);
      } else if (e.field && e.field in details) {
        setErrors({ [e.field]: e.message });
        goto(3);
      } else {
        setPayError(e.message);
      }
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (step === 1) return goto(2);
    if (step === 2) {
      if (draft.start === null) return setErrors({ time: 'Pick a time window to continue.' });
      setErrors({});
      return goto(3);
    }
    if (step === 3) {
      const found = validateDetails(details, !isPickup);
      setErrors(found);
      const firstInvalid = Object.keys(found)[0];
      if (firstInvalid) {
        formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
        return;
      }
      return goto(4);
    }
    setPayError(undefined);
    if (amount === 0 || method === 'cash') return void place({ method: 'cash' });
    if (!isWallet(method) && method !== 'card') return;
    if (method === 'card') {
      const found = validateCard(card);
      setCardErrors(found);
      const firstInvalid = Object.keys(found)[0];
      if (firstInvalid) {
        formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
        return;
      }
      return void place({ method: 'card', last4: cardLast4(card) });
    }
    if (!proof) {
      setProofError('Attach a screenshot of your payment to continue.');
      formRef.current?.querySelector<HTMLElement>('[name="proof"]')?.focus();
      return;
    }
    void place({ method, proof });
  };

  const clearError = (key: keyof Details) => {
    if (errors[key]) setErrors((all) => ({ ...all, [key]: undefined }));
  };

  const field = (key: keyof Details) => ({
    id: `field-${key}`,
    name: key,
    value: details[key],
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `error-${key}` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setDetails((d) => ({ ...d, [key]: e.target.value }));
      clearError(key);
    },
  });

  const fieldError = (key: keyof Details) =>
    errors[key] && (
      <p className="field-error" id={`error-${key}`}>
        {errors[key]}
      </p>
    );

  let submitLabel = 'Continue';
  if (step === 4) submitLabel = busy ? 'Processing…' : amount === 0 || method === 'cash' ? 'Send request' : isWallet(method) ? 'Send request and receipt' : `Pay ${formatMoney(amount)}`;

  return (
    <div className="wrap book">
      <ol className="steps" style={{ '--progress': (step - 1) / (STEPS.length - 1), '--n': STEPS.length } as React.CSSProperties}>
        {STEPS.map((label, i) => (
          <li key={label} data-state={i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo'} aria-current={i + 1 === step ? 'step' : undefined}>
            {i + 1 < step ? (
              <a href={`#/book?step=${i + 1}`} className="step-link">
                {label}
              </a>
            ) : (
              <span>{label}</span>
            )}
          </li>
        ))}
      </ol>

      <div className="book-grid">
        <form className="panel book-form" ref={formRef} onSubmit={submit} noValidate>
          <div className="step-body" key={step} data-direction={direction}>
            {step === 1 && (
              <>
                <h1 ref={headingRef} tabIndex={-1}>
                  What do you need?
                </h1>
                <fieldset className="service-list">
                  <legend className="visually-hidden">Service</legend>
                  {SERVICES.map((s) => {
                    const Icon = SERVICE_ICONS[s.id];
                    return (
                      <label key={s.id} className="choice">
                        <input type="radio" name="service" className="visually-hidden" checked={draft.service === s.id} onChange={() => update({ service: s.id })} />
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

                <fieldset className="group reveal">
                  <legend>{isPickup ? 'Pickup branch' : 'Serving branch'}</legend>
                  {!isPickup && <p className="muted">Your delivery fee depends on how far this branch is from you.</p>}
                  <div className="service-list">
                    {STATIONS.map((s) => (
                      <label key={s.id} className="choice choice-compact">
                        <input type="radio" name="station" className="visually-hidden" checked={draft.stationId === s.id} onChange={() => update({ stationId: s.id })} />
                        <span className="choice-text">
                          <span className="choice-title">{s.name}</span>
                          <span className="choice-sub">{s.area}</span>
                          <span className="choice-sub">{s.hours}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {isPickup && <StationMap station={station} compact />}
                </fieldset>

                <fieldset className="group">
                  <legend>Type of water</legend>
                  <div className="service-list">
                    {WATER_TYPES.map((w) => (
                      <label key={w.id} className="choice choice-compact">
                        <input type="radio" name="waterType" className="visually-hidden" checked={draft.waterType === w.id} onChange={() => update({ waterType: w.id })} />
                        <span className="choice-text">
                          <span className="choice-title">{w.name}</span>
                          <span className="choice-sub">{w.summary}</span>
                        </span>
                        <span className="choice-price">
                          {formatMoney(unitPrice(draft.service, w.id))}
                          <span className="choice-unit">per gallon</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="group qty">
                  <div>
                    <h2 className="label-title">How many gallons?</h2>
                    <p className="muted">Up to {MAX_GALLONS} gallons per order.</p>
                  </div>
                  <Stepper value={draft.gallons} onChange={(gallons) => update({ gallons })} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 ref={headingRef} tabIndex={-1}>
                  {isPickup ? 'When will you collect?' : 'When should we come?'}
                </h1>
                <p className="muted step-lead">{isPickup ? `Times for ${station.name}.` : 'We arrive inside the window you pick.'}</p>
                <TimePicker
                  availability={availability}
                  date={draft.date}
                  start={draft.start}
                  error={errors.time}
                  onDate={(date) => update({ date, start: null })}
                  onStart={(start) => {
                    update({ start });
                    setErrors({});
                  }}
                />
              </>
            )}

            {step === 3 && (
              <>
                <h1 ref={headingRef} tabIndex={-1}>
                  {isPickup ? 'Who is collecting?' : 'Where should we deliver?'}
                </h1>
                <div className="fields">
                  <div className="field">
                    <label htmlFor="field-name">Full name</label>
                    <input type="text" autoComplete="name" {...field('name')} />
                    {fieldError('name')}
                  </div>
                  <div className="field">
                    <label htmlFor="field-phone">Mobile number</label>
                    <input
                      type="tel"
                      autoComplete="tel"
                      inputMode="numeric"
                      placeholder="09171234567"
                      {...field('phone')}
                      onChange={(e) => {
                        setDetails((d) => ({ ...d, phone: formatPhoneInput(e.target.value) }));
                        clearError('phone');
                      }}
                    />
                    {errors.phone ? (
                      fieldError('phone')
                    ) : (
                      <p className="field-hint">
                        <span className="num">
                          {details.phone.length}/{PHONE_LENGTH}
                        </span>{' '}
                        digits. We only call if something changes.
                      </p>
                    )}
                  </div>
                  {!isPickup && (
                    <>
                      <div className="field">
                        <label htmlFor="field-house">House or unit number</label>
                        <input type="text" autoComplete="address-line2" placeholder="Unit 4B" {...field('house')} />
                        {fieldError('house')}
                      </div>
                      <div className="field">
                        <label htmlFor="field-street">Street</label>
                        <input type="text" autoComplete="address-line1" placeholder="Maginhawa St" {...field('street')} />
                        {fieldError('street')}
                      </div>
                      <div className="field field-wide">
                        <label htmlFor="field-barangay">Barangay</label>
                        <input type="text" autoComplete="address-level3" placeholder="Teachers Village East" {...field('barangay')} />
                        {fieldError('barangay')}
                      </div>
                      <div className="field field-wide">
                        <label htmlFor="field-city">City in Metro Manila</label>
                        <select autoComplete="address-level2" {...field('city')}>
                          <option value="">Choose a city</option>
                          {CITIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        {fieldError('city')}
                        {!errors.city && (
                          <p className="field-hint">
                            {distance === null
                              ? `Delivery fee depends on the distance from ${station.name}.`
                              : `About ${distance.toFixed(1)} km from ${station.name}. Delivery fee ${formatMoney(fee)}.`}
                          </p>
                        )}
                      </div>
                      <div className="field field-wide">
                        <label htmlFor="field-note">
                          Delivery note <span className="optional">Optional</span>
                        </label>
                        <textarea rows={2} {...field('note')} />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h1 ref={headingRef} tabIndex={-1}>
                  How would you like to pay?
                </h1>
                {amount === 0 ? (
                  <p className="pay-note" role="status">
                    Nothing to pay. Your free gallon bonus covers this whole order.
                  </p>
                ) : (
                <PaymentStep
                  amount={amount}
                  isPickup={isPickup}
                  method={method}
                  onMethod={(m) => {
                    setMethod(m);
                    setPayError(undefined);
                    setCardErrors({});
                    setProofError(undefined);
                  }}
                  card={card}
                  onCard={(c) => {
                    setCard(c);
                    setCardErrors({});
                    setPayError(undefined);
                  }}
                  cardErrors={cardErrors}
                  proof={proof}
                  onProof={(p) => {
                    setProof(p);
                    setProofError(undefined);
                  }}
                  proofError={proofError}
                  error={payError}
                />
                )}
              </>
            )}
          </div>

          <div className="book-actions">
            {step > 1 ? (
              <a className="btn btn-quiet book-back" href={`#/book?step=${step - 1}`}>
                <ArrowLeft size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <span>Back</span>
              </a>
            ) : (
              <span className="book-actions-spacer" />
            )}
            <p className="book-actions-total">
              <span className="muted">Total</span>
              {formatMoney(amount)}
            </p>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {submitLabel}
              {step < 4 && <ArrowRight className="btn-arrow" size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />}
            </button>
          </div>
        </form>

        <aside className="panel summary" aria-label="Order summary">
          <h2 className="label-title">Your order</h2>
          <GallonRow count={draft.gallons} />
          <dl className="summary-lines">
            <div>
              <dt>Service</dt>
              <dd>{service.name}</dd>
            </div>
            <div>
              <dt>{isPickup ? 'Pick up at' : 'From branch'}</dt>
              <dd>{station.name}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>{draft.date && draft.start !== null ? `${formatDay(draft.date)} · ${formatWindow(draft.start)}` : 'Not chosen yet'}</dd>
            </div>
            <div>
              <dt>{gallonsLabel(draft.gallons)}</dt>
              <dd className="num">{formatMoney(unit * draft.gallons)}</dd>
            </div>
            <div>
              <dt>Water</dt>
              <dd>{WATER_TYPES.find((w) => w.id === draft.waterType)?.name}</dd>
            </div>
            {free && (
              <div className="summary-reward">
                <dt>Free gallon bonus</dt>
                <dd className="num">−{formatMoney(freeValue)}</dd>
              </div>
            )}
            <div>
              <dt>Delivery fee</dt>
              <dd className="num">{!service.delivered ? 'None' : distance === null ? `From ${formatMoney(fee)}, set by city` : formatMoney(fee)}</dd>
            </div>
          </dl>
          <p className="summary-total">
            <span>Total</span>
            <strong className="num">{formatMoney(amount)}</strong>
          </p>
          <p className="muted summary-pay">You choose how to pay in the last step.</p>
        </aside>
      </div>

    </div>
  );
}
