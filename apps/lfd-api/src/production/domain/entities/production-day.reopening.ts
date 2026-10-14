import {
  ReopenAfterBatchesError,
  ReopenAfterDispatchError,
  ReopenAfterPackingError,
} from "../errors/reopening-errors.js";
import type { ProducedItemSnapshot, ProductionBatchSnapshot } from "./production-day.snapshot.js";

/**
 * **Ce qui a commencé en aval du plan**, tel que le colisage et la livraison
 * le disent au fournil par leurs ports (`production/channels/packing/`,
 * `production/channels/delivery/`). L'appelant le lit AVANT le verrou de la
 * journée : pas de lecture d'un autre bloc sous un verrou tenu.
 */
export interface DownstreamProgress {
  /** Une commande de la journée est au bac ou au sac (contenant, ligne ou bac fermé). */
  readonly packingStarted: boolean;
  /** Un bac de la journée est chargé, ou une tournée est partie. */
  readonly dispatchStarted: boolean;
}

/**
 * Refuse une réouverture dès que quelque chose s'appuie sur le plan.
 *
 * Les fournées sont lues ANNULÉES EXCLUES : une fournée saisie par erreur
 * puis annulée n'a rien sorti du four. Une coche de l'ancien poste (`done`)
 * compte comme une fournée — c'est ce qu'elle est (§5.3 des fournées).
 *
 * @throws {ReopenAfterBatchesError} @throws {ReopenAfterPackingError}
 * @throws {ReopenAfterDispatchError}
 */
export function assertReopenable(
  serviceDay: string,
  counts: readonly ProducedItemSnapshot[],
  batches: readonly ProductionBatchSnapshot[],
  progress: DownstreamProgress,
): void {
  const baked =
    batches.some((batch) => batch.cancelled === null) ||
    counts.some((count) => count.done !== null);
  if (baked) {
    throw new ReopenAfterBatchesError(serviceDay);
  }
  if (progress.packingStarted) {
    throw new ReopenAfterPackingError(serviceDay);
  }
  if (progress.dispatchStarted) {
    throw new ReopenAfterDispatchError(serviceDay);
  }
}
