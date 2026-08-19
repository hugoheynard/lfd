// Worker d'entrée du backend B2B en Cloudflare Container.
//
// Rôle : (1) rate-limiter par IP AVANT le container (défense anti-abus/DDoS —
// le flood est rejeté à l'edge sans jamais réveiller Node) ; (2) router la
// requête vers L'instance de container (une seule, cf. `PRIMARY_INSTANCE`) ;
// (3) transférer au container les variables runtime posées comme secrets du
// Worker (`wrangler secret put` → `this.env` → `envVars` → process.env du NestJS).
//
// ⚠️ Hors de `src/` : pas typé par le tsconfig Nest ; wrangler/esbuild le bundle.
// Types éditeur : container/tsconfig.json.
import { Container } from "@cloudflare/containers";

import { guardedFetch } from "./edge-guard";
import type { RateLimiter } from "./edge-guard";

/**
 * Variables runtime forwardées au container. `PORT`/`NODE_ENV` viennent de l'image.
 *
 * ⚠️ **Cette liste est un filtre, pas une documentation.** Un secret posé sur le
 * Worker et absent d'ici n'atteint JAMAIS le NestJS : le container démarre sans,
 * et le réglage se comporte comme non configuré. Rien ne le signale — ni au
 * déploiement, ni au boot, ni dans les logs du Worker.
 *
 * Elle avait divergé de ce que lit `AppConfig`, et ça a coûté cher en
 * production : cinq noms `STORAGE_*` hérités d'un ancien nommage, là où le code
 * lit `R2_*`. Les secrets étaient bien posés, le workflow les poussait bien — et
 * le Worker les jetait. Tout dépôt de KBIS rendait 500. Dans la même dérive, la
 * clé Resend n'était pas transmise : le mailer tournait à blanc, aucune
 * invitation ne partait, et le staff copiait les liens à la main sans savoir
 * qu'il contournait une panne.
 *
 * `container/__tests__/runtime-keys.spec.ts` compare cette liste à ce que la
 * configuration lit réellement. Une troisième dérive échoue en CI.
 */
const RUNTIME_KEYS = [
  "DATABASE_B2B_URL",
  // La base du référentiel produit : depuis B2c il vit dans cette image, avec
  // son propre client Prisma. Absente, l'application refuse de démarrer.
  "DATABASE_PIM_URL",
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "AUTH0_ADMIN_AUDIENCE",
  "AUTH0_M2M_CLIENT_ID",
  "AUTH0_M2M_CLIENT_SECRET",
  // Les deux connexions : le mur entre l'équipe et les clients chez Auth0. Non
  // transmises, elles retombaient sur les défauts du code — justes aujourd'hui,
  // mais alors incorrigeables sans redéployer.
  "AUTH0_STAFF_CONNECTION",
  "AUTH0_CUSTOMER_CONNECTION",
  "BOOTSTRAP_ADMIN_EMAIL",
  // Où atterrit quelqu'un APRÈS avoir posé son mot de passe, et où pointent les
  // boutons des e-mails.
  "CLIENT_BASE_URL",
  "ADMIN_BASE_URL",
  // Courrier : sans la clé, le mailer rend les gabarits et n'envoie rien.
  "RESEND_MAILER_B2B_API_KEY",
  "RESEND_API_KEY",
  "MAILER_FROM_ADDRESS",
  "MAILER_REPLY_TO",
  "MAILER_STAFF_INBOX",
  // Stockage des pièces (KBIS). Endpoint et région sont des faits du COMPTE ;
  // bucket et clés appartiennent à l'USAGE, pour qu'un jeton n'ouvre que le sien.
  "R2_ENDPOINT",
  "R2_REGION",
  "R2_KBIS_BUCKET",
  "R2_KBIS_ACCESS_KEY_ID",
  "R2_KBIS_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // Jeton interne du recompute : forwardé au container (le guard le compare) ET
  // lu ici par le handler `scheduled` (le Cron Trigger le présente à l'endpoint).
  "RECOMPUTE_TOKEN",
  // Identifiants Shopify du référentiel : un seul des deux chemins suffit
  // (jeton statique, ou paire client credentials). Absents, le canal de
  // publication est éteint — l'écran Réglages le dit.
  "SHOPIFY_ADMIN_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
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
 * tient chaud. Le contraire, `getRandom(binding, N)`, tire au sort à chaque
 * requête sans aucune notion de charge : à trafic faible il disperse le trafic
 * sur N instances tièdes au lieu d'en garder une chaude. Cloudflare n'offre à ce
 * jour aucun routage sensible à la charge, et `max_instances` n'est qu'un
 * plafond de facturation — passer à plusieurs instances demandera un signal
 * mesuré, pas un changement de chiffre.
 *
 * Le suffixe `-weur`, lui, n'est pas décoratif : **c'est ce qui déplace l'objet.**
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
    // Toute la politique d'edge (limite + réécriture de l'IP cliente) vit dans
    // `edge-guard.ts`, sous tests. Ici on ne fait que câbler le binding et la
    // destination — c'est délibéré : ce fichier n'est pas testable (il importe
    // le monde Workers), donc il ne doit contenir aucune décision.
    return guardedFetch(request, env.RATE_LIMITER, (forwarded) => backend(env).fetch(forwarded));
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
