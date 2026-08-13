// Worker d'entrée du backend PIM en Cloudflare Container (réparti, stateless) :
// rate-limit par IP à l'edge + forwarding des variables runtime (secrets du
// Worker → env du container).
// Voir apps/lfc-B2B-platform-backend/container/worker.ts pour les détails.
import { Container } from '@cloudflare/containers';

import { guardedFetch } from './edge-guard';
import type { RateLimiter } from './edge-guard';

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

/**
 * Tirage au sort d'une des deux instances, **en Europe de l'Ouest**.
 *
 * Écrit ici plutôt que via `getRandom()` du SDK pour une seule raison : ce
 * helper ne sait pas transmettre de `locationHint`, et sans indice les DO
 * naissent près de la requête qui les crée — au Texas dans le cas du backend
 * B2B (2026-08-13). Le corps est celui de `getRandom` : tirage uniforme puis
 * `idFromName`.
 *
 * Le préfixe `weur-` remplace les anciens `instance-N` : un DO ne change JAMAIS
 * d'emplacement après création et l'indice n'est lu qu'au premier `get()` d'un
 * id — déplacer les instances existantes exigeait donc des ids neufs. Sans état
 * dans ce DO (simple routeur vers l'image), on n'abandonne que du vide.
 *
 * ⚠️ `INSTANCE_COUNT` doit rester ≤ `max_instances` (wrangler.jsonc) : au-delà,
 * on tirerait des instances que Cloudflare refuse de démarrer.
 */
const INSTANCE_COUNT = 2;
const PLACEMENT = { locationHint: 'weur' } as const;

function backend(env: Env): DurableObjectStub<Backend> {
  const index = Math.floor(Math.random() * INSTANCE_COUNT);
  return env.BACKEND.get(
    env.BACKEND.idFromName(`weur-${String(index)}`),
    PLACEMENT,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Toute la politique d'edge vit dans `edge-guard.ts`, sous tests. Ici, que
    // du câblage : ce fichier importe le monde Workers, donc il n'est pas
    // testable — il ne doit donc contenir aucune décision.
    return guardedFetch(request, env.RATE_LIMITER, (forwarded) =>
      backend(env).fetch(forwarded),
    );
  },
};
