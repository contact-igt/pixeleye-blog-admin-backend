/**
 * Deprecated. The canonical newsletter delivery worker is
 * `src/workers/newsletter-delivery.worker.ts`, started via `src/index-newsletter-worker.ts`
 * (`npm run dev:worker` / `npm run newsletter:worker`). This script duplicated that logic
 * with known defects (no transactional claim, unsubscribe-token-as-hash bug, missing Blog
 * data) and is intentionally disabled so it can never run accidentally alongside the
 * canonical worker.
 */
throw new Error(
  'src/scripts/newsletter-worker.ts is deprecated and disabled. Run the canonical worker instead: `npm run dev:worker` (dev) or `npm run newsletter:worker` (production), which start src/workers/newsletter-delivery.worker.ts via src/index-newsletter-worker.ts.'
);
