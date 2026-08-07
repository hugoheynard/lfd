import { AsyncLocalStorage } from "node:async_hooks";

import type { Actor, Instant, RequestContext } from "./request-context.js";

/**
 * Le **porteur** du `RequestContext` : un `AsyncLocalStorage` (natif Node, zéro
 * dépendance) plutôt qu'un provider Nest `request-scoped` (qui coûte une
 * ré-instanciation du graphe DI à chaque requête). Le store suit le flux async
 * de la requête sans être passé en paramètre.
 *
 * `now` et `traceId` sont **figés** à la création ; seul `actor` est renseigné
 * plus tard (le guard résout le principal APRÈS l'ingress). D'où un porteur
 * interne mutable, exposé au reste du code en lecture seule (`RequestContext`).
 */
interface ContextHolder {
  readonly now: Instant;
  readonly traceId: string;
  actor: Actor;
}

const storage = new AsyncLocalStorage<ContextHolder>();

/** Acteur par défaut tant que le principal n'est pas résolu (ou hors requête). */
const SYSTEM_ACTOR: Actor = { type: "system", id: null };

/** Graine d'un contexte : le strict nécessaire posé à l'ingress. */
export interface RequestContextSeed {
  readonly now: Instant;
  readonly traceId: string;
  readonly actor?: Actor;
}

/**
 * Exécute `fn` (et toute sa descendance async) dans un contexte de requête frais.
 * Tout ce qui tourne pendant `fn` voit le même `now` / `traceId`.
 */
export function runWithRequestContext<T>(seed: RequestContextSeed, fn: () => T): T {
  const holder: ContextHolder = {
    now: seed.now,
    traceId: seed.traceId,
    actor: seed.actor ?? SYSTEM_ACTOR,
  };
  return storage.run(holder, fn);
}

/** Le contexte de la requête courante, ou `null` hors d'une requête (cron, boot, tests). */
export function currentRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/**
 * Renseigne l'acteur une fois le principal résolu (appelé par les guards, après
 * l'ingress). **No-op** hors requête — jamais d'erreur si l'ALS est absent.
 */
export function attachActor(actor: Actor): void {
  const holder = storage.getStore();
  if (holder !== undefined) {
    holder.actor = actor;
  }
}
