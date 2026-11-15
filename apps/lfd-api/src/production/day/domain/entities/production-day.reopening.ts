import {
  ReopenAfterBatchesError,
  ReopenAfterDispatchError,
  ReopenAfterPackingError,
} from "../errors/reopening-errors.js";
import type { ProductionBatchSnapshot } from "./production-day.snapshot.js";

/**
 * **Ce qui a commencé en aval du plan**, tel que le colisage et la livraison
 * le disent au fournil par leurs ports (`production/channels/packing/`,
 * `production/channels/delivery/`). L'appelant le lit SOUS le verrou de la
 * journée depuis le 2026-11-02 : lu avant, un colisage commencé entre la
 * lecture et le verrou n'était pas vu.
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
 * puis annulée n'a rien sorti du four. « Cuit » se lit sur les seules
 * fournées : la coche de l'ancien poste n'est plus lue.
 *
 * @throws {ReopenAfterBatchesError} @throws {ReopenAfterPackingError}
 * @throws {ReopenAfterDispatchError}
 */
export function assertReopenable(
  serviceDay: string,
  batches: readonly ProductionBatchSnapshot[],
  progress: DownstreamProgress,
): void {
  if (batches.some((batch) => batch.cancelled === null)) {
    throw new ReopenAfterBatchesError(serviceDay);
  }
  if (progress.packingStarted) {
    throw new ReopenAfterPackingError(serviceDay);
  }
  if (progress.dispatchStarted) {
    throw new ReopenAfterDispatchError(serviceDay);
  }
}
