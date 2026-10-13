import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import type { DeliveryBin } from "../domain/entities/delivery-bin.js";
import type { StopLoading } from "../domain/entities/stop-loading.js";
import {
  BinOrderNotComposedError,
  TransferBinNotPlacedError,
} from "../domain/errors/delivery-loading-errors.js";
import type { CitedBinOwner } from "../domain/events/delivery-loading.events.js";
import { InternalTransferNotFoundError } from "../domain/errors/internal-transfer-errors.js";
import type { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import type { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";
import { citedOrderOf } from "./delivery-loading-support.js";

/**
 * **Le propriétaire d'un bac** (lot T3 du transfert interne) — une commande,
 * ou un transfert : ce que les gestes du chargement (charger, décharger,
 * annuler) partagent pour trouver l'arrêt du bac et le citer au journal.
 */

/** Ce qu'il faut pour nommer le propriétaire d'un bac. */
export interface BinOwnerNames {
  readonly orders: DeliveryOrdersReader;
  readonly transfers: InternalTransfersReader;
}

/**
 * Le chargement de l'arrêt vivant du propriétaire du bac — l'arrêt de sa
 * commande (ou du transfert qui l'emporte), ou l'arrêt de son transfert —,
 * le bac verrouillé en exclusif ; `null` s'il n'est dans aucune tournée.
 */
export function loadingOfBin(
  loadings: StopLoadingRepository,
  bin: DeliveryBin,
): Promise<StopLoading | null> {
  const { subject } = bin;
  return subject.kind === "order"
    ? loadings.forOrder(subject.orderId, bin.id)
    : loadings.forTransfer(subject.transferId, bin.id);
}

/**
 * Le propriétaire cité : la commande par son numéro (ou son id nu), le
 * transfert par son site.
 * @throws {InternalTransferNotFoundError}
 */
export async function citedOwnerOf(names: BinOwnerNames, bin: DeliveryBin): Promise<CitedBinOwner> {
  const { subject } = bin;
  if (subject.kind === "order") {
    return { order: await citedOrderOf(names.orders, subject.orderId) };
  }
  const transfer = await names.transfers.byId(subject.transferId);
  // La clé étrangère du bac (RESTRICT) tient le transfert : l'absence est un défaut.
  if (transfer === null) {
    throw new InternalTransferNotFoundError(subject.transferId);
  }
  return { transfer: { id: transfer.id, name: transfer.siteLabel } };
}

/**
 * Le chargement où charger ce bac ; refusé, en le nommant, quand son
 * propriétaire n'est dans aucune tournée.
 *
 * @throws {BinOrderNotComposedError} @throws {TransferBinNotPlacedError}
 */
export async function composedLoadingOf(
  loadings: StopLoadingRepository,
  names: BinOwnerNames,
  bin: DeliveryBin,
): Promise<{ readonly loading: StopLoading; readonly owner: CitedBinOwner }> {
  const loading = await loadingOfBin(loadings, bin);
  const owner = await citedOwnerOf(names, bin);
  if (loading !== null) {
    return { loading, owner };
  }
  if ("order" in owner) {
    throw new BinOrderNotComposedError(bin.code, nameOf(owner.order));
  }
  throw new TransferBinNotPlacedError(bin.code, owner.transfer.name);
}

function nameOf(cited: { readonly id: string; readonly name: string } | string): string {
  return typeof cited === "string" ? cited : cited.name;
}
