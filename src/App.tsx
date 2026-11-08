import { useEffect, useRef } from 'react';
import { isClosed } from './data';
import { AccountMenu, Wordmark } from './components';
import { replaceRoute, useOrders, useRoute, useSession, useSessionReady, useToast } from './store';
import Home from './views/Home';
import Book from './views/Book';
import Requested from './views/Requested';
import Orders from './views/Orders';
import Admin from './views/Admin';
import { Login, Register } from './views/Auth';
import Privacy from './views/Privacy';

const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('/login') && !next.startsWith('/register') ? next : '/');

export default function App() {
  const route = useRoute();
  const session = useSession();
  const ready = useSessionReady();
  const orders = useOrders();
  const toast = useToast();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const { path, params } = route;
  const isAdmin = session?.kind === 'admin';
  const isAuthPage = path === '/login' || path === '/register';
  const needsAccount = path === '/book' || path === '/orders' || path === '/admin' || path.startsWith('/requested/');

  let redirect: string | null = null;
  if (!ready) {
    // Wait for the server to say who this is before guarding routes.
  } else if (!session && needsAccount) {
    const query = params.toString();
    redirect = `/login?next=${encodeURIComponent(path + (query ? `?${query}` : ''))}`;
  } else if (session && isAuthPage) {
    redirect = safeNext(params.get('next'));
  } else if (isAdmin && path !== '/admin' && path !== '/privacy') {
    redirect = '/admin';
  } else if (session && !isAdmin && path === '/admin') {
    redirect = '/';
  }

  const active = session?.kind === 'customer' ? orders.filter((o) => !isClosed(o)).length : 0;

  useEffect(() => {
    if (redirect) replaceRoute(redirect);
  }, [redirect]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [path]);

  let view = null;
  if (!ready) {
    view = (
      <div className="wrap empty" role="status">
        <p className="muted">Loading…</p>
      </div>
    );
  } else if (!redirect) {
    if (path === '/privacy') view = <Privacy />;
    else if (path === '/login') view = <Login next={params.get('next')} />;
    else if (path === '/register') view = <Register next={params.get('next')} />;
    else if (path === '/admin') view = <Admin />;
    else if (path === '/book' && session?.kind === 'customer') view = <Book params={params} user={session} />;
    else if (path === '/orders' && session?.kind === 'customer') view = <Orders />;
    else if (path.startsWith('/requested/') && session?.kind === 'customer') view = <Requested id={path.slice('/requested/'.length)} />;
    else view = <Home user={session?.kind === 'customer' ? session : null} />;
  }

  const authQuery = params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : '';

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="#/" className="logo-link" aria-label="Akwa home">
            <Wordmark />
          </a>
          <nav className="topnav" aria-label="Main">
            {!session && (
              <>
                <a href={`#/login${authQuery}`} className="navlink" aria-current={path === '/login' ? 'page' : undefined}>
                  Log in
                </a>
                <a href={`#/register${authQuery}`} className="btn btn-primary btn-small">
                  Register
                </a>
              </>
            )}
            {session?.kind === 'customer' && (
              <>
                <a href="#/orders" className="navlink" aria-current={path === '/orders' ? 'page' : undefined}>
                  My orders
                  {active > 0 && (
                    <span className="count" aria-label={`${active} active`}>
                      {active}
                    </span>
                  )}
                </a>
                {path !== '/book' && (
                  <a href="#/book" className="btn btn-primary btn-small topnav-cta">
                    Request a refill
                  </a>
                )}
              </>
            )}
            {isAdmin && (
              <a href="#/admin" className="navlink" aria-current="page">
                Orders
              </a>
            )}
            {session && <AccountMenu session={session} />}
          </nav>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} key={path}>
        {view}
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <span>© Akwa</span>
          <a className="text-link" href="#/privacy">
            Privacy notice
          </a>
        </div>
      </footer>
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.text}
          </div>
        )}
      </div>
    </>
  );
}
