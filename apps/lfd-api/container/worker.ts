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
import type { OutboundHandlerContext } from "@cloudflare/containers";
import * as workersModule from "cloudflare:workers";

import { guardedFetch } from "./edge-guard";
import type { RateLimiter } from "./edge-guard";
import { withServerTiming } from "./server-timing";
import { PRO_SHELVES_INSTANCE } from "./pro-shelves";
import {
  isPublicPurgeCall,
  isPublicPurgeRelay,
  PUBLIC_PURGE_PROPS,
  PUBLIC_SHELF_PURGE_PATH,
  PURGE_TAG_PARAM,
  purgeableTagOf,
  purgeStatusOf,
  type PublicPurgeOutcome,
  type PurgeableTag,
} from "./public-shelf";
import type { ProShelves } from "./pro-shelves";
import { DAY_VERSIONS_INSTANCE } from "./day-versions";
import type { DayVersions } from "./day-versions";
import { DAY_VERSIONS_ENV } from "./day-versions-store";
import {
  DAY_VERSIONS_ORIGIN,
  INTERNAL_OBJECTS_HOST,
  internalObjectRouteOf,
  objectUrlOf,
  SHELF_STORE_ORIGIN,
  type InternalObject,
} from "./internal-objects";
import { isTrustedCaller, SHELF_STORE_ENV } from "./shelf-store";

// L'objet des rayons pro (lot C2) : exporté par le point d'entrée, comme toute
// classe de Durable Object liée dans `wrangler.jsonc`.
export { ProShelves } from "./pro-shelves";
// L'objet des journées (`le-cache-du-back-office.md`, § 3).
export { DayVersions } from "./day-versions";

// Le point d'entrée par lequel un gestionnaire de sortie répond au container
// (lot C0b, `documentation/caching-usage/le-rayon-en-cache.md`).
// L'exporter ne branche RIEN : sans `outboundByHost` sur `Backend`, aucune
// interception n'est posée et le démarrage du container est inchangé
// (`usingInterception` reste faux dans `@cloudflare/containers` 0.3.7, vérifié
// le 2026-11-04).
export { ContainerProxy } from "@cloudflare/containers";

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
  "DATABASE_LFD_URL",
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
  // Le `client_id` de la SPA boutique : l'audience attendue d'un id_token quand
  // quelqu'un rattache une méthode de connexion à son compte. Public par nature
  // (il est déjà dans le bundle), donc posé en VARIABLE — mais il doit traverser
  // comme les autres, sinon la vérification n'a rien à quoi comparer `aud` et
  // refuse tout.
  "AUTH0_CUSTOMER_CLIENT_ID",
  "BOOTSTRAP_ADMIN_EMAIL",
  // Où atterrit quelqu'un APRÈS avoir posé son mot de passe, et où pointent les
  // boutons des e-mails.
  "CLIENT_BASE_URL",
  "ADMIN_BASE_URL",
  // La Base Adresse Nationale, pour « Situer les arrêts » de livraison (lot 7).
  // Absente, le géocodage est éteint : seuls les points GPS du carnet situent.
  "BAN_GEOCODER_URL",
  // Le calcul routier (lots 8 et 8 bis) : `https://lafoliecoffee.info/api/route-planner`,
  // par la passerelle, et le jeton qu'elle exige. En production, l'un sans
  // l'autre éteint « Proposer » — et le bulletin de démarrage le dit.
  "ROUTE_PLANNER_URL",
  "ROUTE_PLANNER_TOKEN",
  // Courrier : sans la clé, le mailer rend les gabarits et n'envoie rien.
  "RESEND_MAILER_B2B_API_KEY",
  "RESEND_API_KEY",
  "MAILER_FROM_ADDRESS",
  "MAILER_REPLY_TO",
  "MAILER_STAFF_INBOX",
  // Signature des webhooks Resend : sans elle, la route de réception refuse
  // tout — elle ne peut rien prouver.
  "RESEND_WEBHOOK_SECRET",
  // Stockage des pièces (KBIS). Endpoint et région sont des faits du COMPTE ;
  // bucket et clés appartiennent à l'USAGE, pour qu'un jeton n'ouvre que le sien.
  // ⚠️ `R2_ENDPOINT` n'est PAS un fait du compte : il dépend de la juridiction
  // du bucket. Il reste le repli commun, et chaque usage peut le surcharger —
  // ce qu'il FAUT ici, les KBIS étant en juridiction EU et les médias non.
  "R2_ENDPOINT",
  "R2_REGION",
  "R2_KBIS_ENDPOINT",
  "R2_MEDIA_ENDPOINT",
  "R2_KBIS_BUCKET",
  "R2_KBIS_ACCESS_KEY_ID",
  "R2_KBIS_SECRET_ACCESS_KEY",
  // Stockage des médias publics (visuels du catalogue) — second usage R2, avec
  // son propre bucket et son propre jeton : un jeton média fuité ne doit pas
  // ouvrir les papiers des clients. L'adresse publique va AVEC : sans elle on
  // rangerait des octets en enregistrant des URL que personne ne résout.
  "R2_MEDIA_BUCKET",
  "R2_MEDIA_ACCESS_KEY_ID",
  "R2_MEDIA_SECRET_ACCESS_KEY",
  "R2_MEDIA_PUBLIC_BASE_URL",
  // Stockage public des images des modèles d'e-mail (lot S3d) — son propre
  // bucket et son propre jeton, comme les médias ; l'adresse publique va avec,
  // et la liste des origines d'où le bloc `mail` accepte de copier une image.
  // Stockage des pièces attachées à un client (bons de commande, feuilles
  // d'atelier, et bientôt les factures du comptable) — troisième usage R2, avec
  // son propre bucket et son propre jeton. Aucune adresse publique ici, et c'est
  // la différence qui compte avec les médias : ces pièces ne sont servies que
  // par l'API, derrière le mur de la société.
  "R2_CUSTOMERS_EU_ENDPOINT",
  "R2_CUSTOMERS_EU_BUCKET",
  "R2_CUSTOMERS_EU_ACCESS_KEY_ID",
  "R2_CUSTOMERS_EU_SECRET_ACCESS_KEY",
  "R2_PRODUCTION_ENDPOINT",
  "R2_PRODUCTION_BUCKET",
  "R2_PRODUCTION_ACCESS_KEY_ID",
  "R2_PRODUCTION_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // Le secret de l'endpoint des liens de paiement (plan M2, §4.5) — vide tant
  // que l'endpoint n'est pas créé chez Stripe : la route rend alors 400.
  "STRIPE_LINKS_WEBHOOK_SECRET",
  // Jeton interne du recompute : forwardé au container (le guard le compare) ET
  // lu ici par le handler `scheduled` (le Cron Trigger le présente à l'endpoint).
  "RECOMPUTE_TOKEN",
  // Lecture d'Analytics Engine par OPS. L'ÉCRITURE, elle, se fait dans la
  // passerelle par un binding et n'a besoin d'aucun secret : seul le lecteur
  // s'authentifie. Absents, OPS rend une fenêtre de répétition — et le dit.
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ANALYTICS_TOKEN",
  // L'application Containers de l'API : ce qui isole SON CPU et SA mémoire
  // parmi les containers du compte. Pas un secret. Absente, la case API de la
  // page Santé dit « CPU non mesuré » — et le bulletin de démarrage le dit.
  "CLOUDFLARE_API_CONTAINER_APPLICATION_ID",
  // La paire VAPID qui signe nos envois Web Push, et l'adresse de contact
  // qu'exige la norme. Absentes, la cloche sonne toujours DANS le back-office ;
  // seul le téléphone reste muet — et le bulletin de démarrage le dit.
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  // 🔴 La clé du coffre de champs, qui scelle les IBAN de nos clients au repos.
  //
  // Sans elle dans cette liste, le container ne la recevrait JAMAIS — et comme
  // `AppConfig` refuse de démarrer en production sans clé, le déploiement
  // tomberait au boot. C'est le seul réglage de cette liste dont l'absence
  // empêche de servir : les autres dégradent, celui-là arrête.
  //
  // Le sens de la garde est voulu. Un backend qui booterait sans clé écrirait
  // des coordonnées bancaires en clair dans une colonne que tout le monde croit
  // scellée, et personne ne le saurait avant de lire la base.
  "FIELD_ENCRYPTION_KEY",
  // L'arrêt d'urgence de l'instantané du catalogue (`le-catalogue-en-memoire.md`,
  // M1b) : `off` fait relire la base à chaque requête. Absente, `on`.
  "CATALOGUE_SNAPSHOT_MEMORY",
  // Les crans de sûreté des purges (boîte d'envoi, suivi des e-mails) :
  // absents, `dry-run` — la purge compte sans supprimer. Leur activation est
  // une décision ; le workflow de déploiement ne les pose pas.
  "OUTBOX_PURGE",
  "MAIL_REQUEST_PURGE",
  "NETWORK_IN_TRANSACTION",
] as const;

type RuntimeKey = (typeof RUNTIME_KEYS)[number];

interface Env extends Partial<Record<RuntimeKey, string>> {
  BACKEND: DurableObjectNamespace<Backend>;
  PRO_SHELVES: DurableObjectNamespace<ProShelves>;
  DAY_VERSIONS: DurableObjectNamespace<DayVersions>;
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
  // Les NOMS reçus, jamais les valeurs : ce que le container a vraiment eu au
  // démarrage. Ajouté le 2026-10-17 : un interrupteur (retiré depuis), posé et
  // téléversé à 17 h 03 la veille, n'était pas vu par l'instance créée à 17 h 03 min 58 —
  // sans cette trace, rien ne disait ce que l'objet avait passé.
  out["LFD_RUNTIME_KEYS"] = Object.keys(out).sort().join(",");
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
  // Secrets du Worker → env du container, plus l'adresse du magasin des rayons
  // pro : posée ICI, à côté du gestionnaire qui l'intercepte, pour que l'hôte
  // appelé et l'hôte intercepté ne puissent pas diverger (lot C2).
  envVars = {
    ...pickEnv(this.env),
    [SHELF_STORE_ENV]: SHELF_STORE_ORIGIN,
    [DAY_VERSIONS_ENV]: DAY_VERSIONS_ORIGIN,
  };

  /**
   * `container` : de l'entrée dans l'objet à la réponse du conteneur. Moins le
   * `app` de Nest, c'est le saut objet → conteneur ; `worker` moins lui, le
   * saut Worker → objet. Les ~55 ms fixes d'un appel (mesurés le 2026-11-04)
   * se rangent ainsi dans l'un ou l'autre (plan de latence, L0).
   */
  override async fetch(request: Request): Promise<Response> {
    const startedAt = performance.now();
    const response = await super.fetch(request);
    return withServerTiming(response, "container", performance.now() - startedAt);
  }
}

/**
 * **Le chemin conteneur → objets partagés** (`le-rayon-en-cache.md`, § 4) :
 * le conteneur appelle `http://objets.interne/rayons/…` ou
 * `http://objets.interne/journees/…`, le Worker intercepte et transmet à
 * l'objet que nomme le PRÉFIXE du chemin, par sa liaison, chemin sans
 * préfixe. Ni route publique, ni jeton. Un préfixe inconnu rend 404.
 *
 * Il REFUSE tout appel dont le `containerId` n'est pas celui de `Backend` :
 * `ContainerProxy` est un point d'entrée exporté, qu'un autre Worker du compte
 * pourrait lier. Le refus (403) fait retomber l'API sur la base.
 *
 * ⚠️ Posé par AFFECTATION, après la classe, et non par `static outboundByHost =`
 * dans son corps : un champ statique se DÉFINIT sur la classe et masquerait
 * l'accesseur hérité de `Container`, qui seul inscrit le gestionnaire — le
 * conteneur démarrerait alors sans interception, sans erreur.
 */
async function internalObjectsGateway(
  request: Request,
  env: Env,
  ctx: OutboundHandlerContext,
): Promise<Response> {
  const trusted = [env.BACKEND.idFromName(PRIMARY_INSTANCE).toString()];
  if (!isTrustedCaller(ctx.containerId, trusted)) {
    return new Response(null, { status: 403 });
  }
  const url = new URL(request.url);
  const route = internalObjectRouteOf(url);
  if (route === null) {
    return new Response(null, { status: 404 });
  }
  if (route.object === "pro-shelves" && isPublicPurgeRelay(request.method, route.pathname)) {
    const tag = purgeableTagOf(url);
    return tag === null
      ? new Response(null, { status: purgeStatusOf({ kind: "unknown_tag" }) })
      : relayPublicPurge(tag);
  }
  return OBJECT_STUBS[route.object](env).fetch(new Request(objectUrlOf(url, route), request));
}

/** La boucle locale vers le point d'entrée par défaut (`ctx.exports`), telle que le runtime la donne. */
type DefaultLoopback = (options: { readonly props: typeof PUBLIC_PURGE_PROPS }) => Fetcher;

function isDefaultLoopback(value: unknown): value is DefaultLoopback {
  return typeof value === "function";
}

/**
 * **La purge du rayon public, relayée au point d'entrée par défaut** (C3) :
 * c'est lui qui garde les réponses publiques, et « des points d'entrée
 * différents ont des caches séparés » (doc Cloudflare, relue le 2026-11-04).
 *
 * `exports` est lu par l'espace de noms, jamais par un import nommé : un nom
 * absent du module ferait échouer le CHARGEMENT du Worker, donc le
 * démarrage — ici, il ne fait qu'échouer la purge (503), que l'API compte et
 * que la durée de 30 s rattrape. ⚠️ Non prouvé en production (2026-11-04).
 */
async function relayPublicPurge(tag: PurgeableTag): Promise<Response> {
  const loopbacks: unknown = Reflect.get(workersModule, "exports");
  const loopback: unknown =
    typeof loopbacks === "object" && loopbacks !== null ? Reflect.get(loopbacks, "default") : null;
  if (!isDefaultLoopback(loopback)) {
    return new Response(null, { status: purgeStatusOf({ kind: "cache_unavailable" }) });
  }
  return loopback({ props: PUBLIC_PURGE_PROPS }).fetch(
    new Request(
      `http://loopback${PUBLIC_SHELF_PURGE_PATH}?${PURGE_TAG_PARAM}=${encodeURIComponent(tag)}`,
      { method: "POST" },
    ),
  );
}

/**
 * Purge, dans le cache de CE point d'entrée, l'étiquette demandée — relue
 * contre la liste fermée ici aussi : la boucle locale ne fait pas foi.
 */
async function purgeTag(request: Request, ctx: ExecutionContext): Promise<Response> {
  const tag = purgeableTagOf(new URL(request.url));
  const outcome: PublicPurgeOutcome =
    tag === null ? { kind: "unknown_tag" } : await publicPurgeOutcome(ctx, tag);
  return new Response(
    outcome.kind === "refused" ? JSON.stringify({ errors: outcome.errors }) : null,
    { status: purgeStatusOf(outcome) },
  );
}

async function publicPurgeOutcome(
  ctx: ExecutionContext,
  tag: PurgeableTag,
): Promise<PublicPurgeOutcome> {
  if (ctx.cache === undefined) {
    return { kind: "cache_unavailable" };
  }
  try {
    const result = await ctx.cache.purge({ tags: [tag] });
    return result.success
      ? { kind: "purged" }
      : { kind: "refused", errors: result.errors.map((error) => `${error.code} ${error.message}`) };
  } catch (error) {
    return { kind: "refused", errors: [error instanceof Error ? error.message : String(error)] };
  }
}

Backend.outboundByHost = { [INTERNAL_OBJECTS_HOST]: internalObjectsGateway };

function proShelves(env: Env): DurableObjectStub<ProShelves> {
  return env.PRO_SHELVES.get(env.PRO_SHELVES.idFromName(PRO_SHELVES_INSTANCE), PLACEMENT);
}

function dayVersions(env: Env): DurableObjectStub<DayVersions> {
  return env.DAY_VERSIONS.get(env.DAY_VERSIONS.idFromName(DAY_VERSIONS_INSTANCE), PLACEMENT);
}

/** La liaison de chaque objet joint par le chemin interne. */
const OBJECT_STUBS: Readonly<Record<InternalObject, (env: Env) => Fetcher>> = {
  "pro-shelves": proShelves,
  "day-versions": dayVersions,
};

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
  await postSweep(env, token, "admin/recompute");
}

/**
 * Réveille le container et déclenche le ramassage des visuels orphelins.
 *
 * Même porte machine-à-machine et même jeton que le recompute : c'est LA porte
 * interne du backend, nommée d'après son premier usage. Un second jeton serait
 * un secret de plus à faire tourner pour exactement le même genre de trafic.
 */
async function triggerMediaSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/media/sweep");
}

/**
 * Réveille le container et déclenche la nuit de la fidélité : le rattrapage des
 * points qu'aucun abonné n'a crédités, puis l'expiration des bons échus.
 *
 * Même porte et même jeton que le recompute. Sans ce passage, un crédit raté
 * par un abonné (`BackgroundWork` avale ses échecs) ne serait jamais rattrapé.
 */
async function triggerLoyaltySweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/loyalty/sweep");
}

/**
 * Réveille le container et déclenche le rappel des liens de paiement non réglés
 * à l'heure limite (plan `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, Q6).
 *
 * Même porte et même jeton que le recompute. La passe est idempotente : un tour
 * manqué est rattrapé au suivant, un tour rejoué ne sonne pas deux fois.
 */
async function triggerSettlementReminders(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/orders/settlement-reminders");
}

/**
 * Réveille le container et déclenche le balayage des photos de contrôle qualité
 * déposées et jamais rattachées (plan `documentation/fournil/plan-controle-qualite.md`, D8),
 * qui balaie aussi le journal des journées du fournil — puis celui de la
 * livraison (`documentation/livraisons/architecture/plan-schema-delivery.md`, SD-D3), par sa
 * propre route : le fournil ne connaît pas la livraison — et enfin la purge du
 * cache du géocodage à 365 jours (`documentation/legal/rgpd-purge-du-geocodage.md`),
 * et l'effacement des positions relevées au geste à 60 jours
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`), et
 * l'anonymisation des messages « Nous écrire » traités depuis douze mois.
 *
 * Même porte et même jeton que le recompute. Idempotent : un tour manqué est
 * rattrapé au suivant, et une photo abandonnée ne coûte qu'une nuit de stockage.
 */
async function triggerQualityUploadSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  // Chaque balayage est indépendant : un appel qui échoue (réseau, container
  // lent au réveil, 5xx) ne doit pas sauter ceux qui suivent pour la nuit —
  // la purge du géocodage tient une promesse faite aux clients (2026-10-06).
  // L'échec est écrit dans les logs du Worker, puis rattrapé la nuit suivante.
  for (const path of [
    "admin/production/quality/sweep",
    "admin/delivery/journal/sweep",
    // Le journal du référentiel (`documentation/caching-usage/le-cache-du-back-office.md`,
    // § 5.2) : sa propre route, la passe du commerce n'atteint pas le PIM.
    "admin/pim/changes/sweep",
    "admin/delivery/geocoding/sweep",
    "admin/delivery/positions/sweep",
    // L'anonymisation des messages « Nous écrire » traités depuis douze mois
    // (`documentation/demandes-client/demandes-clients.md`, §5.3).
    "admin/contact/messages/anonymization/sweep",
    // La purge des messages livrés depuis 30 jours et du suivi des e-mails
    // clos depuis un an (`documentation/mail/plan-service-e-mails.md`,
    // § 7) : une fois par nuit suffit à une durée qui se compte en jours. À
    // BLANC par défaut (`OUTBOX_PURGE`, `MAIL_REQUEST_PURGE` = `dry-run`) :
    // le passage compte ce qu'il supprimerait, et ne supprime rien.
    "admin/outbox/purge",
    "admin/mail/requests/purge",
    // La purge des intentions des gestes réclamées depuis sept jours (décidé
    // par Hugo le 2026-11-12) : toujours active, une clé rejouée après
    // refait le geste.
    "admin/intents/purge",
  ]) {
    await postSweep(env, token, path);
  }
}

/**
 * Réveille le container et passe la constitution automatique du prélèvement
 * (plan `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA3) :
 * le lot du mois clos des entités qui l'ont activée, l'heure prévue passée.
 *
 * Même porte et même jeton que le recompute. Idempotent : une tentative par
 * entité et par cycle, tenue en base — les autres passages se taisent.
 */
async function triggerCollectionAutopilot(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/accounting/collection/autopilot");
}

/**
 * Réveille le container et passe la facture du mois (E4b) — la facture
 * SEULE : à 23h55 le dernier jour, la clôture n'est pas atteinte, le lot
 * reste au passage horaire. Idempotent : une tentative par entité et par
 * mois, tenue en base.
 */
async function triggerMonthlyInvoices(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/accounting/monthly-invoices/autopilot");
}

/**
 * Un appel machine du cron, qui ne lève jamais et ne se tait jamais : un
 * statut non 2xx ou une erreur réseau s'écrit dans les logs du Worker, puis le
 * cron continue (2026-10-06 : les échecs étaient avalés en silence, et un
 * arrêt automatique du plan raté ne laissait aucune trace).
 */
async function postSweep(env: Env, token: string, path: string): Promise<void> {
  try {
    const response = await backend(env).fetch(
      new Request(`https://internal/${path}`, {
        method: "POST",
        headers: { "x-lfc-recompute-token": token },
      }),
    );
    if (!response.ok) {
      console.error(`cron ${path} : HTTP ${String(response.status)}`);
    }
  } catch (error) {
    console.error(`cron ${path} : ${String(error)}`);
  }
}

/**
 * Réveille le container et balaie la boîte d'envoi : livre les faits durables
 * que le chemin rapide n'a pas livrés — processus mort après la validation,
 * abonné en échec dont le délai est échu (plan
 * `documentation/journalisation/plan-boite-d-envoi.md`, §7 B3).
 *
 * Sur le cron de RAFRAÎCHISSEMENT, pas sur un cron à lui : c'est déjà lui qui
 * réveille l'instance toutes les cinq minutes, et un fait en attente ne doit
 * pas attendre plus. Même porte et même jeton que le recompute ; idempotent.
 */
async function triggerOutboxSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/outbox/sweep");
}

/**
 * Réveille le container et balaie les e-mails demandés : reprend, avec la même
 * clé d'idempotence, un envoi resté orphelin entre la validation et l'appel à
 * Resend, ou un échec reprenable ; renonce au-delà de 23 h (plan
 * `documentation/mail/plan-service-e-mails.md`, § 8). Sur le
 * cron de RAFRAÎCHISSEMENT, à côté de la boîte d'envoi : même porte, même
 * jeton, idempotent.
 *
 * Puis la VEILLE (plan § 25) : demandes coincées au-delà de 15 min, échecs
 * définitifs du jour — la cloche du back-office sonne, jamais un e-mail.
 * APRÈS le balayage, pour ne pas sonner sur ce qu'il vient de reprendre ;
 * `postSweep` n'échoue jamais, la veille passe donc même si le balayage a raté.
 */
async function triggerMailRequestsSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/mail/requests/sweep");
  await postSweep(env, token, "admin/mail/requests/watch");
}

/**
 * Réveille le container et passe le tour de l'arrêt du plan : en mode
 * automatique, arrêter le plan du lendemain passé l'heure réglée ; en manuel,
 * alerter passé l'heure d'alerte ; et prévenir si celui d'aujourd'hui n'est pas
 * arrêté (plan `documentation/fournil/arret-du-plan.md`, §3, lot A2).
 *
 * Sur le cron de RAFRAÎCHISSEMENT : au plus cinq minutes de retard sur l'heure
 * réglée. Même porte et même jeton que le recompute ; idempotent — une seule
 * tentative et une seule notification par journée, tenues en base.
 */
async function triggerAutoClose(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/production/auto-close");
}

/**
 * Réveille le container et passe la cloche « hors tournée » de la livraison :
 * le jour de livraison est aujourd'hui, ou demain passé 16 h, le plan est
 * arrêté, et des livraisons ne sont dans aucune tournée (composition
 * automatique, §5). Sur le cron de RAFRAÎCHISSEMENT, comme le tour de l'arrêt
 * du plan : une route à part, parce que le fournil ne connaît pas la
 * livraison. Idempotent — une cloche par jour et par compte hors tournée.
 */
async function triggerRoundsGapBell(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/delivery/off-round/sweep");
}

/**
 * Réveille le container et passe l'expiration des commandes boutique non
 * réglées : annulées avec leur intention 30 minutes après leur passation
 * (plan `documentation/commandes/reglement/commande-carte-reglee.md`, §4.5). Sur le cron
 * de RAFRAÎCHISSEMENT, pas sur un cron à lui : passer toutes les cinq minutes
 * fait une promesse d'« au plus 35 minutes ». Même porte et même jeton que
 * l'autopilot de la facture du mois ; idempotent, l'écriture est conditionnée
 * en base.
 */
async function triggerUnsettledShopOrderExpiry(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/orders/unsettled-shop-orders/expire");
}

/**
 * Réveille le container et passe les remboursements par carte dus (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §6.8, `sweep-card-refunds`) : une demande dont l'exécuteur n'a pas abouti
 * (prestataire injoignable, processus mort) est reprise ici, au plus 20 par
 * passage — l'annulation d'une commande payée y passe depuis le lot P1.c
 * (l'ancienne route `admin/orders/refunds/sweep` est retirée). Sur le cron de
 * RAFRAÎCHISSEMENT ; même porte et même jeton que la boîte d'envoi ;
 * idempotent — le bail de l'exécuteur exclut deux appels au prestataire.
 */
async function triggerCardRefundSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/card-payments/sweep");
}

/**
 * Réveille le container et passe les hausses payées par carte (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5, §2.7.7) :
 * le balayage reprend les compléments payés à appliquer (réveil perdu, panne
 * à reprendre) et demande au prestataire où en sont ceux qui attendent depuis
 * plus de cinq minutes (webhook perdu) ; l'expiration abandonne ceux dont le
 * délai de paiement est passé. Sur le cron de RAFRAÎCHISSEMENT ; même porte
 * et même jeton que la boîte d'envoi ; idempotents — le bail de l'exécuteur
 * et les écritures conditionnées excluent les doubles passages.
 */
async function triggerCardIncreases(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/orders/card-increases/sweep");
  await postSweep(env, token, "admin/orders/card-increases/expire");
}

/**
 * Réveille le container et passe le balayage de la vitrine : la vue publique
 * comparée, par abonné, à la dernière empreinte émise, puis les notifications
 * dues envoyées, signées (doc `documentation/webhooks/vitrine.md`,
 * §1). Sur le cron de RAFRAÎCHISSEMENT : l'agence est prévenue en cinq
 * minutes au plus. Même porte et même jeton que la boîte d'envoi ; sans
 * abonné allumé, le backend ne calcule rien.
 */
async function triggerVitrineSweep(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/vitrine/sweep");
}

/**
 * Réveille le container et passe le réconciliateur des bons de livraison :
 * chaque commande confirmée, prête, remise ou annulée voit son BL aligné, et
 * les écarts non réparables sont comptés (plan
 * plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.2). Sur le
 * cron HORAIRE, pas sur celui de rafraîchissement : il parcourt toutes les
 * commandes, et un écart n'a rien d'urgent — personne ne lit encore le BL.
 * Même porte et même jeton que la boîte d'envoi ; idempotent.
 */
async function triggerDeliveryNotesReconcile(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/delivery-notes/sweep");
}

/**
 * Réveille le container et rattrape les premiers paiements par carte (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.3, §6.8) : les intentions qu'une commande porte et que
 * `card_payment.payment` ne connaît pas encore, ou en retard sur elle. Sur le
 * cron HORAIRE, de P0 à P2 ; idempotent, et muet sans ligne-témoin. Même porte
 * et même jeton que la boîte d'envoi.
 */
async function triggerFirstPaymentsReplay(env: Env): Promise<void> {
  const token = env.RECOMPUTE_TOKEN;
  if (!token) {
    return;
  }
  await postSweep(env, token, "admin/card-payments/first-payments/replay");
}

/**
 * Les passages du cron horaire, chacun pour soi : l'échec de l'un ne prive
 * pas l'autre de son tour (`postSweep` l'écrit dans les logs du Worker).
 */
async function hourlySweeps(env: Env): Promise<void> {
  await Promise.allSettled([
    triggerSettlementReminders(env),
    triggerDeliveryNotesReconcile(env),
    triggerFirstPaymentsReplay(env),
  ]);
}

/**
 * Les balayages du cron de rafraîchissement, chacun pour soi : un échec de
 * l'un (container qui répond mal, réseau) ne prive pas les suivants de leur
 * tour. Le prochain passage est dans cinq minutes ; l'échec ne fait pas
 * échouer le cron, mais `postSweep` l'écrit dans les logs du Worker.
 */
async function refreshSweeps(env: Env): Promise<void> {
  await keepWarm(env);
  await Promise.allSettled([
    triggerOutboxSweep(env),
    triggerMailRequestsSweep(env),
    triggerAutoClose(env),
    triggerRoundsGapBell(env),
    triggerUnsettledShopOrderExpiry(env),
    triggerCardRefundSweep(env),
    triggerCardIncreases(env),
    triggerVitrineSweep(env),
  ]);
}

/**
 * L'expression exacte du cron de rafraîchissement, telle qu'écrite dans
 * `wrangler.jsonc`. Cloudflare ne transmet que cette chaîne pour distinguer les
 * déclenchements : elle doit rester **identique des deux côtés**, sinon le ping
 * serait traité comme un recompute (et le recompute ne partirait jamais).
 */
const KEEP_WARM_CRON = "*/5 * * * *";

/**
 * Le ramassage des visuels orphelins — une fois par jour, à l'heure la plus
 * creuse. Comme ci-dessus, cette chaîne doit rester **identique** à celle de
 * `wrangler.jsonc` : Cloudflare ne transmet qu'elle pour distinguer les
 * déclenchements, et un écart ferait passer le ramassage pour un recompute.
 */
const MEDIA_SWEEP_CRON = "30 3 * * *";

/**
 * La nuit de la fidélité — une fois par jour, avant le ramassage des visuels
 * et loin des commandes. Même règle : identique à `wrangler.jsonc`, sinon elle
 * partirait en recompute.
 */
const LOYALTY_SWEEP_CRON = "0 2 * * *";

/**
 * Le rappel de règlement et la réconciliation des BL — toutes les heures, pile : l'heure limite se règle à
 * la minute, et une heure de retard au plus laisse encore le temps de relancer
 * avant la fournée. Même règle : identique à `wrangler.jsonc`, sinon il
 * partirait en recompute.
 */
const SETTLEMENT_REMINDERS_CRON = "0 * * * *";

/**
 * Le balayage des photos de contrôle — une fois par nuit, un quart d'heure
 * après le ramassage des visuels. Même règle : identique à `wrangler.jsonc`,
 * sinon il partirait en recompute.
 */
const QUALITY_UPLOAD_SWEEP_CRON = "45 3 * * *";

/**
 * La constitution automatique du prélèvement — toutes les heures, au quart :
 * un cron à lui, pas celui des rappels de règlement (`0 *`). Même règle :
 * identique à `wrangler.jsonc`, sinon elle partirait en recompute — et aucun
 * lot ne se préparerait.
 */
const COLLECTION_AUTOPILOT_CRON = "15 * * * *";

/**
 * La facture du mois — le dernier jour à 23h55, heure de Paris (plan
 * `documentation/comptabilite/facturation/facture-emise.md`). Les crons sont en UTC : 21h55 UTC est 23h55 l'été, 22h55 UTC l'est
 * l'hiver. Les deux tombent CHAQUE jour ; c'est le backend qui décide sur
 * l'heure de Paris, et se tait hors du dernier jour. Même règle : identique à
 * `wrangler.jsonc`, sinon elle partirait en recompute.
 */
const MONTHLY_INVOICE_CRON = "55 21,22 * * *";

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

/**
 * Quel travail pour quelle expression. Le `default` est le recompute — il l'a
 * toujours été, et un cron inconnu vaut mieux traité que perdu.
 */
function dispatchCron(cron: string, env: Env): Promise<void> {
  switch (cron) {
    case KEEP_WARM_CRON:
      return refreshSweeps(env);
    case MEDIA_SWEEP_CRON:
      return triggerMediaSweep(env);
    case LOYALTY_SWEEP_CRON:
      return triggerLoyaltySweep(env);
    case SETTLEMENT_REMINDERS_CRON:
      return hourlySweeps(env);
    case QUALITY_UPLOAD_SWEEP_CRON:
      return triggerQualityUploadSweep(env);
    case COLLECTION_AUTOPILOT_CRON:
      return triggerCollectionAutopilot(env);
    case MONTHLY_INVOICE_CRON:
      return triggerMonthlyInvoices(env);
    default:
      return triggerRecompute(env);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // La purge du rayon public (C3) n'arrive que par la boucle locale, marquée
    // de ses `props` : une requête du dehors n'en porte pas, et suit le chemin
    // ordinaire (`public-shelf.ts`, `isPublicPurgeCall`).
    if (isPublicPurgeCall(ctx.props, request.method, new URL(request.url).pathname)) {
      return purgeTag(request, ctx);
    }
    // Toute la politique d'edge (limite + réécriture de l'IP cliente) vit dans
    // `edge-guard.ts`, sous tests. Ici on ne fait que câbler le binding et la
    // destination — c'est délibéré : ce fichier n'est pas testable (il importe
    // le monde Workers), donc il ne doit contenir aucune décision.
    // `worker` couvre le saut vers l'objet `Backend` et son conteneur : moins
    // le `app` que Nest a posé, c'est le transport (plan de latence, L0).
    const startedAt = performance.now();
    const response = await guardedFetch(request, env.RATE_LIMITER, (forwarded) =>
      backend(env).fetch(forwarded),
    );
    // Le datacenter du Worker, dans la description : le saut vers l'objet
    // dépend de la distance entre lui et l'Europe de l'Ouest.
    return withServerTiming(response, "worker", performance.now() - startedAt, request.cf?.colo);
  },

  // Cloudflare Cron Trigger (cf. `triggers.crons` dans wrangler.jsonc). Dix
  // expressions sur le même handler, départagées par l'expression (`dispatchCron`) :
  // toutes les 5 min pour garder le container chaud, toutes les heures pour les
  // liens de paiement non réglés à l'heure limite et la réconciliation des BL, toutes les heures au quart
  // pour la constitution automatique du prélèvement, à 21h55 et 22h55 UTC pour
  // la facture du mois (23h55 à Paris, été comme hiver), 3×/jour aux heures creuses
  // pour le recompute batch, et 1×/nuit pour la fidélité, le ramassage des
  // visuels orphelins et le balayage des photos de contrôle. `waitUntil` garde le Worker vivant jusqu'à la fin de
  // l'appel container.
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(dispatchCron(controller.cron, env));
  },
};
