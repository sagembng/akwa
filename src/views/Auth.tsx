import { useEffect, useRef, useState } from 'react';
import { PasswordField } from '../components';
import { CITIES, EMPTY_ADDRESS, formatPhoneInput, PASSWORD_HELP, PHONE_LENGTH, validateRegistration, type AddressFields, type RegisterErrors, type RegisterInput } from '../data';
import { login, register, type LoginErrors } from '../store';

// Hardcoded demo customer, seeded by the server. Override with DEMO_EMAIL and DEMO_PASSWORD there.
const DEMO_ACCOUNT = { email: 'demo@akwa.example', password: 'AkwaDemo2026!' };

function AuthLayout({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="auth">
      <div className="auth-side on-navy" aria-hidden="true">
        <p className="auth-tagline">Water, right when you need it.</p>
        <svg className="hero-water" viewBox="0 0 2880 200" preserveAspectRatio="none">
          <path className="wave-back" d="M0 80Q360 20 720 80T1440 80T2160 80T2880 80V200H0Z" />
          <path className="wave-front" d="M0 130Q360 185 720 130T1440 130T2160 130T2880 130V200H0Z" />
        </svg>
      </div>
      <div className="auth-main">
        <div className="auth-form-wrap">
          <h1 ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
          <p className="muted auth-lead">{lead}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

const nextQuery = (next: string | null) => (next ? `?next=${encodeURIComponent(next)}` : '');

export function Login({ next }: { next: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const attempt = async (mail: string, pass: string) => {
    const found: LoginErrors = {};
    if (!mail.trim()) found.email = 'Enter your email.';
    else if (!/^\S+@\S+\.\S+$/.test(mail.trim())) found.email = 'Enter an email address like name@example.com.';
    if (!pass) found.password = 'Enter your password.';
    if (found.email || found.password) {
      setErrors(found);
      formRef.current?.querySelector<HTMLElement>(found.email ? '[name="email"]' : '[name="password"]')?.focus();
      return;
    }
    setBusy(true);
    setErrors({});
    const failure = await login(mail, pass);
    if (failure) {
      setBusy(false);
      setErrors(failure);
      formRef.current?.querySelector<HTMLElement>(failure.email ? '[name="email"]' : '[name="password"]')?.focus();
    }
    // On success the session changes and App redirects away from this page.
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void attempt(email, password);
  };

  const useDemo = () => {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
    void attempt(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  };

  return (
    <AuthLayout title="Log in to Akwa" lead={next ? 'Log in to continue your order.' : 'Request water and track your orders.'}>
      <form className="auth-form" ref={formRef} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email || errors.form) setErrors((all) => ({ ...all, email: undefined, form: undefined }));
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
          {errors.email && (
            <p className="field-error" id="login-email-error" role="alert">
              {errors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <PasswordField
            id="login-password"
            name="password"
            value={password}
            autoComplete="current-password"
            invalid={!!errors.password}
            describedBy={errors.password ? 'login-password-error' : undefined}
            onChange={(v) => {
              setPassword(v);
              if (errors.password || errors.form) setErrors((all) => ({ ...all, password: undefined, form: undefined }));
            }}
          />
          {errors.password && (
            <p className="field-error" id="login-password-error" role="alert">
              {errors.password}
            </p>
          )}
        </div>
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <button type="button" className="btn btn-quiet btn-block" onClick={useDemo} disabled={busy}>
          Log in as the demo customer
        </button>
      </form>
      <p className="auth-switch">
        New to Akwa?{' '}
        <a className="text-link" href={`#/register${nextQuery(next)}`}>
          Create an account
        </a>
      </p>
    </AuthLayout>
  );
}

export function Register({ next }: { next: string | null }) {
  const [form, setForm] = useState<RegisterInput>({ name: '', email: '', phone: '', password: '', privacyAccepted: false, address: EMPTY_ADDRESS });
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const showErrors = (found: RegisterErrors) => {
    setErrors(found);
    const first = (Object.keys(found) as (keyof RegisterErrors)[]).find((k) => found[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return !!first;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showErrors(validateRegistration(form, confirm))) return;
    setBusy(true);
    const found = await register(form);
    if (showErrors(found)) setBusy(false);
  };

  const setAddress = (key: keyof AddressFields, value: string) => {
    setForm((f) => ({ ...f, address: { ...(f.address ?? EMPTY_ADDRESS), [key]: value } }));
    if (errors[key]) setErrors((all) => ({ ...all, [key]: undefined }));
  };

  const set = (key: 'name' | 'email' | 'phone' | 'password', value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((all) => ({ ...all, [key]: undefined }));
  };

  const errorText = (key: keyof RegisterErrors) =>
    errors[key] && (
      <p className="field-error" id={`register-${key}-error`}>
        {errors[key]}
      </p>
    );

  const described = (key: keyof RegisterErrors) => (errors[key] ? `register-${key}-error` : undefined);

  return (
    <AuthLayout title="Create your account" lead="You will need it to request water and track your orders.">
      <form className="auth-form" ref={formRef} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="register-name">Full name</label>
          <input id="register-name" name="name" type="text" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={errors.name ? true : undefined} aria-describedby={described('name')} />
          {errorText('name')}
        </div>
        <div className="field">
          <label htmlFor="register-email">Email</label>
          <input id="register-email" name="email" type="email" autoComplete="username" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={errors.email ? true : undefined} aria-describedby={described('email')} />
          {errorText('email')}
        </div>
        <div className="field">
          <label htmlFor="register-phone">Mobile number</label>
          <input id="register-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="09171234567" value={form.phone} onChange={(e) => set('phone', formatPhoneInput(e.target.value))} aria-invalid={errors.phone ? true : undefined} aria-describedby={described('phone')} />
          {errors.phone ? errorText('phone') : <p className="field-hint"><span className="num">{form.phone.length}/{PHONE_LENGTH}</span> digits, starting with 09.</p>}
        </div>
        <fieldset className="group address-group">
          <legend>Delivery address <span className="optional">Optional</span></legend>
          <p className="field-hint">Save it now and it fills in when you book. Leave it empty to add it later.</p>
          <div className="field">
            <label htmlFor="register-house">House or unit number</label>
            <input id="register-house" name="house" type="text" autoComplete="address-line2" value={form.address?.house ?? ''} onChange={(e) => setAddress('house', e.target.value)} aria-invalid={errors.house ? true : undefined} aria-describedby={described('house')} />
            {errorText('house')}
          </div>
          <div className="field">
            <label htmlFor="register-street">Street</label>
            <input id="register-street" name="street" type="text" autoComplete="address-line1" value={form.address?.street ?? ''} onChange={(e) => setAddress('street', e.target.value)} aria-invalid={errors.street ? true : undefined} aria-describedby={described('street')} />
            {errorText('street')}
          </div>
          <div className="field">
            <label htmlFor="register-barangay">Barangay</label>
            <input id="register-barangay" name="barangay" type="text" autoComplete="address-level3" value={form.address?.barangay ?? ''} onChange={(e) => setAddress('barangay', e.target.value)} aria-invalid={errors.barangay ? true : undefined} aria-describedby={described('barangay')} />
            {errorText('barangay')}
          </div>
          <div className="field">
            <label htmlFor="register-city">City in Metro Manila</label>
            <select id="register-city" name="city" autoComplete="address-level2" value={form.address?.city ?? ''} onChange={(e) => setAddress('city', e.target.value)} aria-invalid={errors.city ? true : undefined} aria-describedby={described('city')}>
              <option value="">Choose a city</option>
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {errorText('city')}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="register-password">Password</label>
          <PasswordField id="register-password" name="password" value={form.password} autoComplete="new-password" invalid={!!errors.password} describedBy={described('password')} onChange={(v) => set('password', v)} />
          {errors.password ? errorText('password') : <p className="field-hint">{PASSWORD_HELP}</p>}
        </div>
        <div className="field">
          <label htmlFor="register-confirm">Confirm password</label>
          <PasswordField
            id="register-confirm"
            name="confirm"
            value={confirm}
            autoComplete="new-password"
            invalid={!!errors.confirm}
            describedBy={described('confirm')}
            onChange={(v) => {
              setConfirm(v);
              if (errors.confirm) setErrors((all) => ({ ...all, confirm: undefined }));
            }}
          />
          {errorText('confirm')}
        </div>
        <div className="field">
          <label className="consent">
            <input
              type="checkbox"
              name="privacyAccepted"
              checked={form.privacyAccepted}
              aria-invalid={errors.privacyAccepted ? true : undefined}
              aria-describedby={described('privacyAccepted')}
              onChange={(e) => {
                const privacyAccepted = e.target.checked;
                setForm((f) => ({ ...f, privacyAccepted }));
                if (errors.privacyAccepted) setErrors((all) => ({ ...all, privacyAccepted: undefined }));
              }}
            />
            <span>
              I have read the{' '}
              <a className="text-link" href="#/privacy" target="_blank" rel="noreferrer">
                privacy notice
              </a>
              .
            </span>
          </label>
          {errorText('privacyAccepted')}
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account?{' '}
        <a className="text-link" href={`#/login${nextQuery(next)}`}>
          Log in
        </a>
      </p>
    </AuthLayout>
  );
}
