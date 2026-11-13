// @ts-check
import {defineConfig} from 'astro/config';

import node from '@astrojs/node';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// Server code reads secrets from process.env at runtime (never inlined at build time). Locally that
// env comes from .env; on Vercel there is no .env and the project's environment variables apply.
try {
  process.loadEnvFile();
} catch {}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [react()],
  // Same app both ways: a plain Node server locally, serverless functions on Vercel.
  adapter: process.env.VERCEL ? vercel() : node({mode: 'standalone'}),
});
