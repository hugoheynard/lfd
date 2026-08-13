// Worker d'entrée du backend B2B en Cloudflare Container.
//
// Rôle : (1) rate-limiter par IP AVANT le container (défense anti-abus/DDoS —
// le flood est rejeté à l'edge sans jamais réveiller Node) ; (2) router la
// requête vers L'instance de container (une seule, nommée — cf. `PRIMARY`) ;
// (3) transférer au container les variables runtime posées comme secrets du
// Worker (`wrangler secret put` → `this.env` → `envVars` → process.env du NestJS).
//
// ⚠️ Hors de `src/` : pas typé par le tsconfig Nest ; wrangler/esbuild le bundle.
// Types éditeur : container/tsconfig.json.
import { Container } from "@cloudflare/containers";

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
  // Jeton interne du recompute : forwardé au container (le guard le compare) ET
  // lu ici par le handler `scheduled` (le Cron Trigger le présente à l'endpoint).
  "RECOMPUTE_TOKEN",
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
  // Délai d'INACTIVITÉ, pas un maintien en éveil : sans requête pendant une
  // heure l'instance s'endort, et la requête suivante paie le démarrage à
  // froid. Ce qui la garde chaude est le cron de rafraîchissement ci-dessous ;
  // cette ligne n'est que le filet quand le cron ne passe plus.
  sleepAfter = "1h";
  envVars = pickEnv(this.env); // secrets du Worker → env du container.
}

/**
 * Le nom de l'instance unique — **déterministe, et c'est tout l'intérêt** : un
 * nom fixe route toujours vers le même container, donc vers celui que le cron
 * tient chaud.
 *
 * Le contraire, `getRandom(binding, N)`, tire au sort à chaque requête sans
 * aucune notion de charge. À trafic faible il disperse le trafic sur N
 * instances tièdes au lieu d'en garder une chaude, et une requête sur N paie un
 * démarrage à froid — l'inverse de ce qu'on cherche. Cloudflare ne fournit à ce
 * jour aucun routage sensible à la charge (leur page « Scaling and Routing »
 * l'annonce au futur), et `max_instances` n'est qu'un plafond de facturation,
 * pas un déclencheur. Passer à plusieurs instances demandera donc un vrai
 * signal mesuré, pas un changement de chiffre.
 */
/**
 * Le suffixe `-weur` n'est pas décoratif : **c'est ce qui déplace l'objet.**
 *
 * Un Durable Object ne change jamais d'emplacement après sa création (Cloudflare
 * annonce la relocalisation « pour plus tard »), et `locationHint` n'est lu qu'au
 * TOUT PREMIER `get()` d'un id donné. L'ancien id `"primary"` avait été créé par
 * le cron, donc loin de nos clients — constaté à Dallas-Fort Worth le
 * 2026-08-13. Poser un indice dessus n'aurait rien fait : il fallait un id neuf.
 *
 * Ça ne coûte rien ici parce que ce DO ne stocke RIEN : il n'est qu'un routeur
 * vers l'image NestJS (`Backend` ne touche jamais `ctx.storage`). Le renommer
 * abandonne un objet vide. Sur un DO porteur d'état, ce serait une migration.
 */
const PRIMARY_INSTANCE = "primary-weur";

/**
 * Indice de placement du DO — à ne pas confondre avec les `constraints` du
 * container (wrangler.jsonc), qui sont, elles, une vraie contrainte
 * d'ordonnancement. Ici Cloudflare choisit « le centre de données minimisant la
 * latence depuis l'indice », donc au mieux ; ça suffit, un DO européen ne
 * repartira pas au Texas.
 *
 * **Les deux réglages sont nécessaires.** Le Worker s'exécute à l'edge (Paris),
 * appelle le DO, qui appelle le container : ne corriger que le container
 * laisserait l'aller-retour transatlantique sur le premier saut.
 *
 * `getContainer()` du SDK ne sait pas transmettre d'indice — d'où le
 * `idFromName` + `get` explicites, qui sont exactement ce qu'il fait par ailleurs.
 */
const PLACEMENT = { locationHint: "weur" } as const;

function backend(env: Env): DurableObjectStub<Backend> {
  return env.BACKEND.get(env.BACKEND.idFromName(PRIMARY_INSTANCE), PLACEMENT);
}

/** 429 renvoyé quand une IP dépasse son quota edge. `Retry-After` = fenêtre. */
function tooManyRequests(): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: { "retry-after": "60", "content-type": "text/plain" },
  });
}

/** L'en-tête que le backend NestJS lit pour identifier le client (throttler). */
const CLIENT_IP_HEADER = "x-lfc-client-ip";

/**
 * Résout l'IP cliente — **uniquement depuis `cf-connecting-ip`**, que Cloudflare
 * pose lui-même sur toute requête entrante et qu'un client ne peut pas falsifier.
 *
 * On ne lit surtout PAS `x-lfc-client-ip` ici : c'est une valeur qui vient du
 * client. Absente ⇒ appel interne (cron), qu'on ne limite pas.
 */
function clientIp(request: Request): string | null {
  const direct = request.headers.get("cf-connecting-ip");
  return direct !== null && direct !== "" ? direct : null;
}

/**
 * Réécrit `x-lfc-client-ip` **avant** de transmettre au container.
 *
 * ## Le trou que ça bouche
 *
 * Le backend NestJS clé son throttler sur `x-lfc-client-ip` (`resolveClientIp`),
 * en s'appuyant sur un invariant écrit dans son propre commentaire : « la gateway
 * la recopie et l'écrase toujours, donc non spoofable ». **Cet invariant était
 * faux** : il n'y a aucune gateway sur le chemin (aucune route, `PROD_ROUTES`
 * vide, et le domaine visé n'existe pas en DNS), et ce Worker restera de toute
 * façon joignable en direct sur `workers.dev`. Personne n'écrasait donc rien.
 *
 * Mesuré en production le 2026-08-13, 75 requêtes sur `/platform-settings`
 * (limite 60/min) : en-tête FIXE → 15 rejets en 429 ; en-tête TOURNANT → **zéro
 * rejet**. Même client, même minute, même volume. Il suffisait d'incrémenter un
 * en-tête à chaque requête pour n'être jamais limité.
 *
 * ## Pourquoi ici et pas dans le backend
 *
 * Ce Worker EST la frontière de confiance : le dernier point où l'on connaît la
 * vraie IP (`cf-connecting-ip`, posée par Cloudflare) et le premier que la
 * requête franchit. En écrasant l'en-tête ici, on rend enfin VRAI ce que le
 * backend supposait — sans qu'il ait à changer, et que la gateway existe un jour
 * ou non.
 *
 * On **supprime** l'en-tête plutôt que de le laisser passer quand
 * `cf-connecting-ip` manque (appel interne) : sinon un client pourrait le poser
 * lui-même sur un chemin où on ne le remplace pas.
 */
function withTrustedClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  const real = clientIp(request);
  if (real === null) {
    headers.delete(CLIENT_IP_HEADER);
  } else {
    headers.set(CLIENT_IP_HEADER, real);
  }
  return new Request(request, { headers });
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

/**
 * Réveille le container et déclenche le recompute batch du read-model `lead_score`.
 * On passe par le container (pas de calcul dans le Worker) et on présente le jeton
 * interne à `POST /admin/recompute` — que le `RecomputeGuard` compare. Sans jeton
 * configuré, on ne tente rien (l'endpoint refuserait de toute façon, fail-closed).
 */
async function triggerRecompute(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await backend(env).fetch(
    new Request("https://internal/admin/recompute", {
      method: "POST",
      headers: { "x-lfc-recompute-token": token },
    }),
  );
}

/**
 * L'expression exacte du cron de rafraîchissement, telle qu'écrite dans
 * `wrangler.jsonc`. Cloudflare ne transmet que cette chaîne pour distinguer les
 * déclenchements : elle doit rester **identique des deux côtés**, sinon le ping
 * serait traité comme un recompute (et le recompute ne partirait jamais).
 */
const KEEP_WARM_CRON = "*/5 * * * *";

/**
 * Garde l'instance chaude en la sollicitant plus souvent que son `sleepAfter`.
 *
 * C'est ce qui fait la différence entre « s'endort après une heure de calme » et
 * « répond tout de suite à 7 h du matin ». On frappe `/health` : route publique
 * et hors throttler, qui n'ouvre ni la base ni rien d'autre — le but est de
 * toucher le container, pas de mesurer quoi que ce soit.
 *
 * Une erreur ici ne mérite pas de faire échouer le déclenchement : le prochain
 * ping arrive dans cinq minutes, et un cron en échec n'a aucun lecteur.
 */
async function keepWarm(env: Env): Promise<void> {
  try {
    await backend(env).fetch(new Request("https://internal/health"));
  } catch {
    // Silencieux par conception : voir ci-dessus.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (await isRateLimited(request, env)) {
      return tooManyRequests();
    }
    // Jamais `request` brut : le container ne doit voir que l'en-tête d'IP
    // réécrit ici, sinon son throttler se laisse guider par le client.
    return backend(env).fetch(withTrustedClientIp(request));
  },

  // Cloudflare Cron Trigger (cf. `triggers.crons` dans wrangler.jsonc). Deux
  // rythmes sur le même handler, départagés par l'expression : toutes les 5 min
  // pour garder le container chaud, et 3×/jour aux heures creuses pour le
  // recompute batch. `waitUntil` garde le Worker vivant jusqu'à la fin de
  // l'appel container.
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    const work = controller.cron === KEEP_WARM_CRON ? keepWarm(env) : triggerRecompute(env);
    ctx.waitUntil(work);
  },
};
