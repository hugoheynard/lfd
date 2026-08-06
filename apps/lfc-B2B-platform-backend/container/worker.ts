// Worker d'entrée du backend B2B en Cloudflare Container.
//
// Rôle : router la requête vers UNE instance de container (réparti, stateless) ET
// transférer au container les variables runtime posées comme secrets du Worker
// (`wrangler secret put` → `this.env` → `envVars` → process.env du NestJS).
//
// ⚠️ Hors de `src/` : pas typé par le tsconfig Nest ; wrangler/esbuild le bundle.
// Types éditeur : container/tsconfig.json.
import { Container, getRandom } from "@cloudflare/containers";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const instance = await getRandom(env.BACKEND, 2);
    return instance.fetch(request);
  },
};
