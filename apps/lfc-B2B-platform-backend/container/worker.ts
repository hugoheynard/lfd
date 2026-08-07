// Worker d'entrée du backend B2B en Cloudflare Container.
//
// Rôle : (1) rate-limiter par IP AVANT le container (défense anti-abus/DDoS —
// le flood est rejeté à l'edge sans jamais réveiller Node) ; (2) router la
// requête vers UNE instance de container (réparti, stateless) ; (3) transférer
// au container les variables runtime posées comme secrets du Worker
// (`wrangler secret put` → `this.env` → `envVars` → process.env du NestJS).
//
// ⚠️ Hors de `src/` : pas typé par le tsconfig Nest ; wrangler/esbuild le bundle.
// Types éditeur : container/tsconfig.json.
import { Container, getRandom } from "@cloudflare/containers";

/**
 * Binding Rate Limiting de Cloudflare (déclaré dans wrangler.jsonc). `limit()`
 * compte les appels par `key` sur la fenêtre configurée et répond `success:false`
 * quand le quota est dépassé. Le comptage vit à l'edge, hors du container.
 */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Variables runtime forwardées au container. `PORT`/`NODE_ENV` viennent de l'image. */
const RUNTIME_KEYS = [
  "DATABASE_B2B_URL",
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "AUTH0_ADMIN_AUDIENCE",
  "AUTH0_M2M_CLIENT_ID",
  "AUTH0_M2M_CLIENT_SECRET",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
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

/** Le container = un Durable Object qui pilote l'image NestJS. */
export class Backend extends Container<Env> {
  defaultPort = 8080; // NestJS écoute ce port (Dockerfile : ENV PORT=8080).
  sleepAfter = "1h"; // reste chaud → anti cold-start.
  envVars = pickEnv(this.env); // secrets du Worker → env du container.
}

/** 429 renvoyé quand une IP dépasse son quota edge. `Retry-After` = fenêtre. */
function tooManyRequests(): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: { "retry-after": "60", "content-type": "text/plain" },
  });
}

/**
 * Résout l'IP cliente. `x-lfc-client-ip` d'abord : la gateway y recopie l'IP
 * réelle (`cf-connecting-ip`) et l'écrase toujours, donc non spoofable — c'est la
 * seule valeur fiable quand la requête a franchi la gateway (le `cf-connecting-ip`
 * vu ici serait alors l'IP de l'infra, pas du client). En accès direct (sans
 * gateway), on retombe sur `cf-connecting-ip`. Aucune des deux ⇒ appel interne.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-lfc-client-ip");
  if (forwarded !== null && forwarded !== "") {
    return forwarded;
  }
  const direct = request.headers.get("cf-connecting-ip");
  return direct !== null && direct !== "" ? direct : null;
}

/**
 * Passe le rate-limiter par IP cliente. Sans IP (appel interne), on ne limite
 * pas — on ne bloque pas un chemin d'infra sur une clé absente. `true` = à rejeter.
 */
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
