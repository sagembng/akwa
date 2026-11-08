import { useRef, useState } from 'react';
import { Banknote, CreditCard, FlaskConical, ImageUp, Smartphone, type LucideIcon } from 'lucide-react';
import { formatMoney, manilaNow, QR_IMAGES, TEST_CARDS, type PaymentMethod } from '../data';
import { ICON_STROKE } from '../components';
import { readProofFile } from '../store';

export interface CardFields {
  number: string;
  expiry: string;
  cvc: string;
}

export type CardErrors = Partial<Record<keyof CardFields, string>>;

export const EMPTY_CARD: CardFields = { number: '', expiry: '', cvc: '' };

const digitsOf = (s: string) => s.replace(/\D/g, '');
const groupCard = (s: string) => digitsOf(s).slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ');

function formatExpiry(s: string) {
  const d = digitsOf(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export const WALLET_NAMES = { gcash: 'GCash', maya: 'Maya' };

export function validateCard(card: CardFields): CardErrors {
  const errors: CardErrors = {};
  const digits = digitsOf(card.number);
  if (digits !== TEST_CARDS.approved && digits !== TEST_CARDS.declined) errors.number = 'Only the two test cards below are accepted.';
  const match = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
  const now = manilaNow();
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || new Date(2000 + Number(match[2]), Number(match[1])) <= now) {
    errors.expiry = 'Enter a future date as MM/YY.';
  }
  if (!/^\d{3}$/.test(card.cvc)) errors.cvc = 'Enter 3 digits.';
  return errors;
}

/** Only these four digits go to the server. The full number stays in the browser. */
export const cardLast4 = (card: CardFields) => digitsOf(card.number).slice(-4);

export function PaymentStep(props: {
  amount: number;
  isPickup: boolean;
  method: PaymentMethod;
  onMethod: (method: PaymentMethod) => void;
  card: CardFields;
  onCard: (card: CardFields) => void;
  cardErrors: CardErrors;
  proof: string | null;
  onProof: (proof: string | null) => void;
  proofError?: string;
  error?: string;
}) {
  const { amount, isPickup, method, onMethod, card, onCard, cardErrors, proof, onProof, proofError, error } = props;
  const options: { id: PaymentMethod; name: string; sub: string; icon: LucideIcon }[] = [
    { id: 'gcash', name: 'GCash', sub: 'Scan the QR code, then attach your receipt', icon: Smartphone },
    { id: 'maya', name: 'Maya', sub: 'Scan the QR code, then attach your receipt', icon: Smartphone },
    { id: 'card', name: 'Credit or debit card', sub: 'Test cards only', icon: CreditCard },
    { id: 'cash', name: isPickup ? 'Cash at the branch' : 'Cash on delivery', sub: `Pay ${formatMoney(amount)} when you get your water`, icon: Banknote },
  ];

  const fill = (number: string) => onCard({ number: groupCard(number), expiry: '12/30', cvc: '123' });

  return (
    <div className="pay">
      <p className="demo-note">
        <FlaskConical size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
        <span>
          <strong>Payments are simulated.</strong> The QR codes are samples and no money moves. Cards accept the test numbers only.
        </span>
      </p>

      <fieldset className="service-list">
        <legend className="visually-hidden">Payment method</legend>
        {options.map((o) => (
          <label key={o.id} className="choice choice-pay">
            <input type="radio" name="payment-method" className="visually-hidden" checked={method === o.id} onChange={() => onMethod(o.id)} />
            <span className="choice-icon">
              <o.icon size={22} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </span>
            <span className="choice-text">
              <span className="choice-title">{o.name}</span>
              <span className="choice-sub">{o.sub}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {(method === 'gcash' || method === 'maya') && (
        <WalletPay method={method} amount={amount} proof={proof} onProof={onProof} error={proofError} />
      )}

      {method === 'card' && (
        <div className="card-form reveal">
          <div className="field field-wide">
            <label htmlFor="card-number">Test card number</label>
            <input
              id="card-number"
              name="number"
              inputMode="numeric"
              autoComplete="off"
              value={card.number}
              aria-invalid={cardErrors.number ? true : undefined}
              aria-describedby={cardErrors.number ? 'card-number-error' : undefined}
              onChange={(e) => onCard({ ...card, number: groupCard(e.target.value) })}
            />
            {cardErrors.number && (
              <p className="field-error" id="card-number-error">
                {cardErrors.number}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="card-expiry">Expiry</label>
            <input
              id="card-expiry"
              name="expiry"
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/YY"
              value={card.expiry}
              aria-invalid={cardErrors.expiry ? true : undefined}
              aria-describedby={cardErrors.expiry ? 'card-expiry-error' : undefined}
              onChange={(e) => onCard({ ...card, expiry: formatExpiry(e.target.value) })}
            />
            {cardErrors.expiry && (
              <p className="field-error" id="card-expiry-error">
                {cardErrors.expiry}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="card-cvc">CVC</label>
            <input
              id="card-cvc"
              name="cvc"
              inputMode="numeric"
              autoComplete="off"
              value={card.cvc}
              aria-invalid={cardErrors.cvc ? true : undefined}
              aria-describedby={cardErrors.cvc ? 'card-cvc-error' : undefined}
              onChange={(e) => onCard({ ...card, cvc: digitsOf(e.target.value).slice(0, 3) })}
            />
            {cardErrors.cvc && (
              <p className="field-error" id="card-cvc-error">
                {cardErrors.cvc}
              </p>
            )}
          </div>
          <div className="test-cards field-wide">
            <button type="button" className="btn btn-quiet" onClick={() => fill(TEST_CARDS.approved)}>
              Use card that pays
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => fill(TEST_CARDS.declined)}>
              Use card that declines
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="pay-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The shop's QR code for GCash or Maya, with the amount to send and the receipt upload. */
function WalletPay(props: { method: 'gcash' | 'maya'; amount: number; proof: string | null; onProof: (proof: string | null) => void; error?: string }) {
  const { method, amount, proof, onProof, error } = props;
  const name = WALLET_NAMES[method];
  return (
    <div className="wallet-pay reveal">
      <div className="qr-card">
        <img className="qr-image" src={QR_IMAGES[method]} width={750} height={750} alt={`${name} QR code for Akwa. Sample code, no money moves.`} />
        <div className="qr-text">
          <h2 className="label-title">Pay with {name}</h2>
          <ol className="qr-steps">
            <li>Open {name} and scan this QR code.</li>
            <li>
              Send exactly <strong className="num">{formatMoney(amount)}</strong>.
            </li>
            <li>Take a screenshot of the receipt and attach it below.</li>
          </ol>
          <p className="muted">Your branch checks the receipt before it confirms your order.</p>
        </div>
      </div>
      <ProofUpload proof={proof} onProof={onProof} error={error} />
    </div>
  );
}

/** File input for the payment screenshot. Hands back a small JPEG data URL. */
export function ProofUpload(props: { proof: string | null; onProof: (proof: string | null) => void; error?: string; label?: string }) {
  const { proof, onProof, error, label = 'Receipt screenshot' } = props;
  const [problem, setProblem] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = problem ?? error;

  const choose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProblem(undefined);
      onProof(await readProofFile(file));
    } catch (err) {
      onProof(null);
      setProblem((err as Error).message);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="field proof-upload">
      <label htmlFor="proof-file">{label}</label>
      <input
        ref={inputRef}
        id="proof-file"
        name="proof"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? 'proof-error' : 'proof-hint'}
        onChange={choose}
      />
      {shown ? (
        <p className="field-error" id="proof-error" role="alert">
          {shown}
        </p>
      ) : (
        <p className="field-hint" id="proof-hint">
          <ImageUp size={16} strokeWidth={ICON_STROKE} aria-hidden="true" /> PNG, JPG or WebP.
        </p>
      )}
      {proof && <img className="proof-preview" src={proof} alt="Your attached receipt" />}
    </div>
  );
}
