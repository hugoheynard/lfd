// Worker d'entrée du backend PIM en Cloudflare Container (réparti, stateless) :
// rate-limit par IP à l'edge + forwarding des variables runtime (secrets du
// Worker → env du container).
// Voir apps/lfc-B2B-platform-backend/container/worker.ts pour les détails.
import { Container, getRandom } from '@cloudflare/containers';

/** Binding Rate Limiting Cloudflare (wrangler.jsonc) : compte par `key` à l'edge. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Variables runtime forwardées au container. `PORT`/`NODE_ENV` viennent de l'image. */
const RUNTIME_KEYS = [
  'DATABASE_URL',
  'AUTH0_DOMAIN',
  'AUTH0_AUDIENCE',
  'SHOPIFY_ADMIN_TOKEN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
] as const;

type RuntimeKey = (typeof RUNTIME_KEYS)[number];

interface Env extends Partial<Record<RuntimeKey, string>> {
  BACKEND: DurableObjectNamespace<Backend>;
  RATE_LIMITER: RateLimiter;
}

/** Ne garde que les variables réellement définies (optionnelles absentes = feature off). */
function pickEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of RUNTIME_KEYS) {
    const value = env[key];
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

export class Backend extends Container<Env> {
  defaultPort = 8080; // NestJS écoute ce port (Dockerfile : ENV PORT=8080).
  sleepAfter = '1h'; // reste chaud → anti cold-start.
  envVars = pickEnv(this.env); // secrets du Worker → env du container.
}

/** 429 renvoyé quand une IP dépasse son quota edge. */
function tooManyRequests(): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: { 'retry-after': '60', 'content-type': 'text/plain' },
  });
}

/**
 * IP cliente : `x-lfc-client-ip` (propagée et écrasée par la gateway, non
 * spoofable) d'abord, sinon `cf-connecting-ip` (accès direct). Cf. le worker B2B.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-lfc-client-ip');
  if (forwarded !== null && forwarded !== '') {
    return forwarded;
  }
  const direct = request.headers.get('cf-connecting-ip');
  return direct !== null && direct !== '' ? direct : null;
}

/** Rate-limit par IP cliente. Sans IP (appel interne) : pas de limite. */
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  const ip = clientIp(request);
  if (ip === null) {
    return false;
  }
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  return !success;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (await isRateLimited(request, env)) {
      return tooManyRequests();
    }
    const instance = await getRandom(env.BACKEND, 2);
    return instance.fetch(request);
  },
};
