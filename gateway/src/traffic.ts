import type { BackendKey, FrontKey } from "./routes";

/**
 * Ce que la gateway **observe** de son propre trafic — la troisième source
 * d'OPS, à côté du heartbeat (ce qu'un nœud dit de lui-même) et du probe (ce
 * qu'on constate du dehors). Design : `documentation/suite/architecture-ops-ecosystem-health.md` §12.
 *
 * Toute la décision vit ici, en fonctions **pures**, comme `routes.ts` : ce
 * fichier ne connaît ni `Request`, ni Analytics Engine, ni le monde Workers.
 * `index.ts` ne fait qu'exécuter.
 *
 * ## Granularité — un point par requête, agrégé à la LECTURE
 *
 * On n'écrit aucun compteur pré-agrégé. Un compteur oblige à décider à
 * l'écriture ce qu'on saura lire — fenêtre, dimensions — et l'on ne peut plus
 * revenir en arrière sur le passé. Analytics Engine agrège en SQL au moment de
 * la question ; une interrogation qu'on n'avait pas prévue reste posable sur
 * les données déjà écrites.
 *
 * **Rien de tout ça ne touche Postgres.** Les points vivent chez Cloudflare,
 * trois mois, et se lisent par l'API SQL. La base ne voit jamais un hit.
 *
 * ## Ce qu'on écrit, et surtout ce qu'on n'écrit pas
 *
 * Aucun identifiant client, aucune IP, aucun chemin complet. La gateway est
 * le seul maillon qui voit l'IP réelle (`cf-connecting-ip`) : raison de plus
 * pour qu'elle ne la dépose nulle part. Savoir **quoi** est lent suffit à une
 * carte de santé ; savoir **qui** n'est pas sa question.
 */

/** Le dataset — même nom ici et dans `wrangler.toml`, c'est la couture. */
export const TRAFFIC_DATASET = "lfc_gateway_traffic";

/**
 * Qui a fabriqué la réponse. La distinction est le cœur du §12 : un `5xx`
 * **upstream** dit que le backend a échoué en répondant ; un `502` **gateway**
 * dit qu'il n'a pas répondu du tout. Le second est la preuve d'un nœud mort,
 * le premier ne l'est pas.
 */
export type TrafficOrigin = "upstream" | "gateway";

/**
 * Le nœud visé — backends ET fronts servis par la zone. Deux valeurs hors
 * nœuds : `unrouted` (aucun préfixe ne correspond — le 404 de la gateway) et
 * `dev` (routage par sous-domaine, qui n'existe qu'en local et ne désigne aucun
 * nœud de production).
 */
export type TrafficNode = BackendKey | FrontKey | "unrouted" | "dev";

export interface TrafficObservation {
  readonly node: TrafficNode;
  readonly status: number;
  /** Le chemin **transmis au backend** (préfixe déjà retiré), pas celui reçu. */
  readonly forwardedPath: string;
  readonly durationMs: number;
  readonly origin: TrafficOrigin;
}

/**
 * La forme d'un point Analytics Engine. `indexes` est limité à **une** entrée
 * (96 octets) : c'est la clé d'échantillonnage, donc la dimension qu'on ne veut
 * jamais perdre — le nœud.
 */
export interface TrafficPoint {
  readonly indexes: readonly [string];
  readonly blobs: readonly string[];
  readonly doubles: readonly number[];
}

/**
 * Classe de statut. `429` est **sorti du `4xx`** : c'est le throttler NestJS qui
 * mord, la seule défense qui fonctionne (le rate-limit edge est inerte, cf.
 * `documentation/ops/`), et elle est aujourd'hui invisible. On veut la compter
 * à part, pas la noyer dans les erreurs client.
 */
export function statusClass(status: number): string {
  if (status === 429) {
    return "429";
  }
  if (status >= 500) {
    return "5xx";
  }
  if (status >= 400) {
    return "4xx";
  }
  if (status >= 300) {
    return "3xx";
  }
  return "2xx";
}

/** Un segment est gardé s'il est un MOT : minuscules et tirets, jamais de chiffre. */
const WORD = /^[a-z][a-z-]*$/;
/** Longueur au-delà de laquelle un « mot » n'en est plus un (garde-fou cardinalité). */
const MAX_SEGMENT = 24;

/**
 * La **surface** appelée : au plus deux segments du chemin transmis, chacun
 * remplacé par `_` s'il ne ressemble pas à un mot.
 *
 * Deux segments et pas un : `admin` seul rangerait tout le back-office dans une
 * case unique, alors que `admin/companies` et `admin/orders` sont les deux
 * choses qu'on veut distinguer quand quelque chose rame.
 *
 * Le filtre `WORD` refuse tout segment contenant un chiffre : c'est ce qui
 * empêche un identifiant (`cmszuyr12000t…`, un SIRET, un numéro) d'entrer dans
 * une dimension — il exploserait la cardinalité ET porterait de la donnée
 * client, les deux choses qu'on refuse ici.
 */
export function surfaceOf(forwardedPath: string): string {
  const segments = forwardedPath.split("?")[0].split("/").filter(Boolean);
  if (segments.length === 0) {
    return "root";
  }
  return segments
    .slice(0, 2)
    .map((segment) => (segment.length <= MAX_SEGMENT && WORD.test(segment) ? segment : "_"))
    .join("/");
}

/**
 * Le point à écrire.
 *
 * `doubles` ne porte **que** la durée : le nombre de requêtes se lit
 * `SUM(_sample_interval)` en SQL, la colonne que Analytics Engine tient
 * lui-même. Ajouter un `1` constant ferait une seconde vérité sur le même
 * comptage, fausse dès que l'échantillonnage se déclenche.
 */
export function trafficPoint(observation: TrafficObservation): TrafficPoint {
  return {
    indexes: [observation.node],
    blobs: [
      statusClass(observation.status),
      surfaceOf(observation.forwardedPath),
      observation.origin,
    ],
    doubles: [Math.max(0, Math.round(observation.durationMs))],
  };
}

/**
 * Le point, rendu en une ligne lisible — la **simulation de dev**.
 *
 * En local il n'y a ni dataset ni API SQL : sans ça, le J1 serait invérifiable
 * avant un déploiement, et on écrirait la suite (lecture, agrégats, écran) à
 * l'aveugle sur un format jamais vu. La ligne journalisée porte exactement les
 * mêmes champs que le point écrit en production — pas une approximation :
 * **la même fonction pure** la construit.
 *
 * Format : `ops b2b 2xx admin/orders upstream 12ms`. Volontairement plat et
 * grep-able ; ce n'est pas une trace, c'est la preuve qu'on observe.
 */
export function formatTrafficPoint(point: TrafficPoint): string {
  return ["ops", ...point.indexes, ...point.blobs, `${point.doubles[0]}ms`].join(" ");
}
