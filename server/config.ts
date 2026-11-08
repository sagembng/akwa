// Three admin accounts, one per branch, hardcoded by project decision and seeded into
// the database at startup. A branch admin sees and handles only that branch's orders.
// The passwords stay on the server, but they are visible to anyone who can read the
// repository. On a public deployment set ADMIN_<BRANCH>_PASSWORD for each branch
// (ADMIN_PASSWORD is a shared fallback for any branch without its own).
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AkwaAdmin2026!';

export const ADMINS = [
  { branchId: 'maginhawa', name: 'Akwa Maginhawa Admin', email: process.env.ADMIN_MAGINHAWA_EMAIL ?? 'admin.maginhawa@akwa.example', password: process.env.ADMIN_MAGINHAWA_PASSWORD ?? ADMIN_PASSWORD },
  { branchId: 'kapitolyo', name: 'Akwa Kapitolyo Admin', email: process.env.ADMIN_KAPITOLYO_EMAIL ?? 'admin.kapitolyo@akwa.example', password: process.env.ADMIN_KAPITOLYO_PASSWORD ?? ADMIN_PASSWORD },
  { branchId: 'poblacion', name: 'Akwa Poblacion Admin', email: process.env.ADMIN_POBLACION_EMAIL ?? 'admin.poblacion@akwa.example', password: process.env.ADMIN_POBLACION_PASSWORD ?? ADMIN_PASSWORD },
];

// A hardcoded customer account for trying the app without registering.
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@akwa.example';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'AkwaDemo2026!';

export const SESSION_DAYS = 14;
export const SESSION_COOKIE = 'akwa_session';
