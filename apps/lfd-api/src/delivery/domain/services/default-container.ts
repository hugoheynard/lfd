import type { BinType } from "../entities/bin-type.js";
import {
  DefaultContainerBinTypeArchiveError,
  DefaultContainerBinTypeUnavailableError,
} from "../errors/delivery-composition-errors.js";
import type { DefaultContainer } from "../value-objects/routing-settings.js";

/**
 * **Le contenant par défaut d'une commande cite un type EN SERVICE**
 * (2026-10-06). La règle lie le réglage et le catalogue des bacs : elle vit
 * ici, comme le socle de la composition, et reçoit ce que les ports en lisent.
 * Deux faces : on ne choisit pas un type hors service, et on n'archive pas
 * celui qui est choisi (refus plutôt que réglage vidé en silence).
 */

/** @throws {DefaultContainerBinTypeUnavailableError} */
export function ensureDefaultContainerInService(
  container: DefaultContainer | null,
  activeBinTypeIds: readonly string[],
): void {
  if (container === null || activeBinTypeIds.includes(container.binTypeId)) {
    return;
  }
  throw new DefaultContainerBinTypeUnavailableError(container.binTypeId);
}

/**
 * Appelée AVANT d'archiver `binType`.
 *
 * @throws {DefaultContainerBinTypeArchiveError}
 */
export function ensureNotDefaultContainer(
  binType: BinType,
  container: DefaultContainer | null,
): void {
  if (container !== null && container.binTypeId === binType.id) {
    throw new DefaultContainerBinTypeArchiveError(binType.name);
  }
}
