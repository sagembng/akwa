// Three admin accounts, one per branch, hardcoded by project decision and seeded into
// the database at startup. A branch admin sees and handles only that branch's orders.
// The passwords stay on the server, but they are visible to anyone who can read the
// repository. Set ADMIN_PASSWORD to override all three on a public deployment.
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AkwaAdmin2026!';

export const ADMINS = [
  { branchId: 'maginhawa', name: 'Akwa Maginhawa Admin', email: process.env.ADMIN_MAGINHAWA_EMAIL ?? 'admin.maginhawa@akwa.example' },
  { branchId: 'kapitolyo', name: 'Akwa Kapitolyo Admin', email: process.env.ADMIN_KAPITOLYO_EMAIL ?? 'admin.kapitolyo@akwa.example' },
  { branchId: 'poblacion', name: 'Akwa Poblacion Admin', email: process.env.ADMIN_POBLACION_EMAIL ?? 'admin.poblacion@akwa.example' },
];

// A hardcoded customer account for trying the app without registering.
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@akwa.example';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'AkwaDemo2026!';

export const SESSION_DAYS = 14;
export const SESSION_COOKIE = 'akwa_session';
