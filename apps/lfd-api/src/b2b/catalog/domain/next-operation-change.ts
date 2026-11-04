import { OperationDayEndMissingError } from "./errors/catalog-operation-errors.js";
import { endOfDay, opensAt, reachesAudience } from "./operation-access.js";
import type { ShopAudience } from "./ports/catalog.reader.js";
import type { SellableOperation } from "./ports/catalog-operations.reader.js";

/**
 * **Le prochain instant où une opération datée change d'elle-même ce qu'un
 * rayon montre** (`documentation/caching-usage/plan-rayon-jusqu-a-la-prochaine-heure.md`,
 * § 1). Rend `null` quand aucune opération n'a plus d'instant à venir.
 *
 * Les quatre instants de D4 (`operation-access.ts`) : l'annonce (l'encart
 * apparaît), l'ouverture de la commande (`orderFrom`, ou l'annonce), la
 * clôture, et la fin du dernier jour de retrait — minuit, heure de Paris
 * (l'encart s'efface). Un instant passé ou égal à `now` est ignoré : la vue
 * calculée à `now` l'a déjà appliqué.
 *
 * Seules comptent les opérations qui atteignent cette clientèle : les autres
 * ne changent rien à son rayon.
 *
 * Pure : `now` est l'instant de la requête, lu par l'appelant sur le `Clock`.
 *
 * @throws {OperationDayEndMissingError} minuit n'existe pas le lendemain du
 *   dernier jour de retrait (la même hypothèse que `endOfDay`).
 */
export function nextOperationChange(
  operations: readonly SellableOperation[],
  audience: ShopAudience,
  now: Date,
): Date | null {
  let next: number | null = null;
  for (const operation of operations) {
    if (!reachesAudience(operation, audience)) {
      continue;
    }
    for (const instant of instantsOf(operation)) {
      const at = instant.getTime();
      if (at > now.getTime() && (next === null || at < next)) {
        next = at;
      }
    }
  }
  return next === null ? null : new Date(next);
}

function instantsOf(operation: SellableOperation): readonly Date[] {
  return [operation.announceFrom, opensAt(operation), operation.orderUntil, ...dayEndOf(operation)];
}

/**
 * La fin du dernier jour de retrait, ou rien si elle n'existe pas.
 *
 * 🔴 Une échéance de cache ne doit JAMAIS empêcher de servir le rayon : ce
 * calcul est appelé pour des opérations à venir, que la vue elle-même ne
 * traduit pas encore. Sans cet instant, le plafond de 5 minutes borne
 * l'échéance — rien n'est faux plus longtemps (2026-11-04, « la prod ne
 * tombe jamais »).
 */
function dayEndOf(operation: SellableOperation): readonly Date[] {
  try {
    return [endOfDay(operation.pickupUntil)];
  } catch (error) {
    if (error instanceof OperationDayEndMissingError) {
      return [];
    }
    throw error;
  }
}
