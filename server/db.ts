import { hashPassword } from './security';
import { ADMINS, ADMIN_PASSWORD, DEMO_EMAIL, DEMO_PASSWORD } from './config';

export interface Queryable {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  exec(sql: string): Promise<void>;
  tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** Neon, or any Postgres, through a connection string. */
export async function connectPostgres(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
    exec: async (sql) => void (await pool.query(sql)),
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (sql, params) => (await client.query(sql, params as any[])).rows });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Embedded Postgres: on disk for local development, in memory for tests. */
export async function connectEmbedded(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  return {
    query: async (sql, params) => (await lite.query(sql, params as any[])).rows as any[],
    exec: async (sql) => void (await lite.exec(sql)),
    tx: (fn) =>
      lite.transaction((tx) => fn({ query: async (sql, params) => (await tx.query(sql, params as any[])).rows as any[] })) as Promise<any>,
    close: () => lite.close(),
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  branch_id text,
  password_hash text NOT NULL,
  privacy_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS saved_details (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  city text NOT NULL,
  house text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  barangay text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('delivery', 'swap', 'pickup')),
  gallons int NOT NULL CHECK (gallons BETWEEN 1 AND 6),
  station_id text,
  date date NOT NULL,
  start_hour int NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  address text,
  note text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled')),
  price_per_gallon int NOT NULL,
  fee int NOT NULL,
  total int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_window_idx ON orders(date, start_hour);

CREATE TABLE IF NOT EXISTS order_events (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id);

-- Mock payments only. Card numbers are never sent or stored, just the last 4 test digits.
CREATE TABLE IF NOT EXISTS payments (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('gcash', 'maya', 'card', 'cash')),
  status text NOT NULL CHECK (status IN ('paid', 'pending', 'review', 'rejected', 'refunded', 'void')),
  amount int NOT NULL,
  reference text NOT NULL,
  last4 text,
  proof text,
  proof_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrades for databases created before branch admins, address parts and payment proofs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE saved_details ADD COLUMN IF NOT EXISTS house text NOT NULL DEFAULT '';
ALTER TABLE saved_details ADD COLUMN IF NOT EXISTS street text NOT NULL DEFAULT '';
ALTER TABLE saved_details ADD COLUMN IF NOT EXISTS barangay text NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS water_type text NOT NULL DEFAULT 'purified' CHECK (water_type IN ('purified', 'mineral', 'alkaline', 'distilled'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_gallon boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_at timestamptz;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('paid', 'pending', 'review', 'rejected', 'refunded', 'void'));
-- An address saved before it was split keeps its text in the street field.
UPDATE saved_details SET street = address WHERE house = '' AND street = '' AND barangay = '';
`;

export async function migrate(db: Db) {
  await db.exec(SCHEMA);
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  for (const admin of ADMINS) {
    await db.query(
      `INSERT INTO users (name, email, phone, role, branch_id, password_hash, privacy_accepted_at)
       VALUES ($1, $2, '', 'admin', $3, $4, now())
       ON CONFLICT (email) DO UPDATE SET role = 'admin', branch_id = EXCLUDED.branch_id, password_hash = EXCLUDED.password_hash`,
      [admin.name, admin.email, admin.branchId, adminHash],
    );
  }
  // Exactly three admins exist: drop any other admin left from an earlier setup.
  await db.query(`DELETE FROM users WHERE role = 'admin' AND email <> ALL($1::text[])`, [ADMINS.map((a) => a.email)]);
  await db.query(
    `INSERT INTO users (name, email, phone, role, password_hash, privacy_accepted_at)
     VALUES ('Demo Customer', $1, '09171234567', 'customer', $2, now())
     ON CONFLICT (email) DO UPDATE SET role = 'customer', password_hash = EXCLUDED.password_hash`,
    [DEMO_EMAIL, await hashPassword(DEMO_PASSWORD)],
  );
}
