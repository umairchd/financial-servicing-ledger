import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString ?? '');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  // Keep small in a serverless deployment: many concurrent function instances
  // can each hold a pool, and Neon's own connection pooler sits in front of
  // this -- use its pooled ("-pooler") connection string in production.
  max: isLocal ? 10 : 3,
});

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
