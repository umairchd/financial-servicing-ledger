import { app } from '../src/app';

// Express apps are callable as (req, res), which is exactly the handler
// signature Vercel's Node runtime invokes -- no adapter needed.
export default app;
