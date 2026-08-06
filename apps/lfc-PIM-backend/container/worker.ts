// Worker d'entrée du backend PIM en Cloudflare Container (réparti, stateless) +
// forwarding des variables runtime (secrets du Worker → env du container).
// Voir apps/lfc-B2B-platform-backend/container/worker.ts pour les détails.
import { Container, getRandom } from "@cloudflare/containers";

/** Variables runtime forwardées au container. `PORT`/`NODE_ENV` viennent de l'image. */
const RUNTIME_KEYS = [
  "DATABASE_URL",
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "SHOPIFY_ADMIN_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
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
