import dotenv from 'dotenv';

// Vitest setupFiles run before test files are imported, so DATABASE_URL is set
// before src/db/pool.ts is loaded.
dotenv.config({ path: '.env.test', override: true });
