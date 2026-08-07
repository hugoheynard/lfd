/**
 * Contexte **immuable** d'une requête — le socle temps / traçabilité.
 *
 * Posé **une fois** par un middleware d'ingress (`requestContextMiddleware`) et
 * lu partout via l'AsyncLocalStorage (`request-context.store.ts`). Deux garanties :
 * un **seul instant** par requête (le temps métier, gelé à l'entrée) et un
 * **traceId** unique de bout en bout (corrélation logs / journal / erreurs).
 *
 * ⚠️ `now` est le **temps métier** — l'autorité, c'est ce champ (lu via le port
 * `Clock`), jamais un `new Date()` disséminé ni un temps propagé par la gateway
 * (celui-là ne sert qu'à l'observabilité : latence, jamais à écrire du métier).
 */

/** Un point dans le temps (timestamp). Alias sémantique de `Date`, produit **uniquement** par le `Clock`. */
export type Instant = Date;

/** Nature de l'acteur d'une requête — recopiée telle quelle dans le journal d'événements. */
export type ActorType = "customer" | "staff" | "system";

/** Qui agit sur la requête. `id` est nul pour `system` (cron, boot, hors requête). */
export interface Actor {
  readonly type: ActorType;
  readonly id: string | null;
}

/** Contexte lu par les consommateurs (Clock, ActivityRecorder, filtre d'erreur, logs). */
export interface RequestContext {
  /** Instant gelé à l'ingress : le temps métier de CETTE requête. */
  readonly now: Instant;
  /** Identifiant de trace (W3C) propagé/généré à l'ingress. */
  readonly traceId: string;
  /** Acteur résolu — `system` tant que le guard n'a pas renseigné le principal. */
  readonly actor: Actor;
}
