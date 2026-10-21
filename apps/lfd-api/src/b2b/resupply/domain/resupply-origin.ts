import { UnknownResupplyOriginError } from "./site-resupply-errors.js";

/**
 * Qui envoie un réassort (lot R1d, Hugo 2026-10-21) : `counter` — le
 * comptoir, par sa demande en cours ; `bakehouse` — le fournil, « je t'envoie
 * ça », un réassort à part qui naît envoyé et ne touche jamais la demande
 * du comptoir.
 */
export type ResupplyOrigin = "counter" | "bakehouse";

const ORIGINS: readonly ResupplyOrigin[] = ["counter", "bakehouse"];

/** L'origine relue d'une valeur stockée, refusée si inconnue. */
export function resupplyOriginOf(value: string): ResupplyOrigin {
  const origin = ORIGINS.find((known) => known === value);
  if (origin === undefined) {
    throw new UnknownResupplyOriginError(value);
  }
  return origin;
}
