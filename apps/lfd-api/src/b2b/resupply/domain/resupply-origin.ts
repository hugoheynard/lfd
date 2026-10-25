import { UnknownResupplyOriginError } from "./site-resupply-errors.js";

/**
 * Qui envoie un réassort (lot R1d, Hugo 2026-10-21) : `counter` — le
 * comptoir, par sa demande en cours ; `bakehouse` — le fournil, « je t'envoie
 * ça », un réassort à part qui naît envoyé et ne touche jamais la demande
 * du comptoir ; `reserve` — une sortie de la réserve du colisage (plan A1, lot
 * A1.4), du pain déjà fabriqué : né envoyé « au plus tôt », il n'entre
 * jamais au plan, au four, aux réservations ni au transfert.
 */
export type ResupplyOrigin = "counter" | "bakehouse" | "reserve";

const ORIGINS: readonly ResupplyOrigin[] = ["counter", "bakehouse", "reserve"];

/**
 * Le fournil a-t-il quelque chose à fabriquer pour ce réassort ? Non pour une
 * sortie de réserve : le pain est déjà fait (plan A1, lot A1.4). Les lecteurs
 * du fournil — l'arrêt, le lancement, « Réassorts à produire », Prod manager
 * — n'en voient donc aucun.
 */
export function isProducedByBakehouse(origin: ResupplyOrigin): boolean {
  return origin !== "reserve";
}

/** L'origine relue d'une valeur stockée, refusée si inconnue. */
export function resupplyOriginOf(value: string): ResupplyOrigin {
  const origin = ORIGINS.find((known) => known === value);
  if (origin === undefined) {
    throw new UnknownResupplyOriginError(value);
  }
  return origin;
}
