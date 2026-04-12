import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Log file at cwd (reliable) — not vite.config dirname (may differ under tooling). */
function debugLogPath(): string {
  return path.join(process.cwd(), 'debug-ecf1fb.log');
}

/** Writes one NDJSON line per POST (debug session ecf1fb). Dev server only. */
function debugIngestEcf1fbPlugin(): Plugin {
  return {
    name: 'debug-ingest-ecf1fb',
    /* Run before Vite HTML fallback so POST /__debug/ingest is not swallowed. */
    enforce: 'pre',
    configureServer(server) {
      try {
        fs.appendFileSync(
          debugLogPath(),
          `${JSON.stringify({
            sessionId: 'ecf1fb',
            hypothesisId: 'BOOT',
            message: 'vite dev server configured (debug ingest middleware registered)',
            timestamp: Date.now(),
          })}\n`,
          'utf8'
        );
      } catch {
        /* ignore */
      }
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname !== '/__debug/ingest' || req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8').trim();
            fs.appendFileSync(debugLogPath(), `${body}\n`, 'utf8');
            res.statusCode = 204;
          } catch {
            res.statusCode = 500;
          }
          res.end();
        });
        req.on('error', () => {
          res.statusCode = 500;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [debugIngestEcf1fbPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        privacy: './privacy.html',
        terms: './terms.html',
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
          sanitize: ['dompurify'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'dist/**', '**/*.test.ts'],
    },
  },
});
