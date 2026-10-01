import type { DeliveryOrdersReader } from "../channels/commerce/index.js";
import { SharedBinToRedoError } from "../domain/errors/delivery-bin-declaration-errors.js";
import {
  DriverRoundBlockedError,
  DriverRoundDepartedError,
  DriverRoundNotReadyError,
  DriverRoundStaleError,
  DriverSharedBinToRedoError,
} from "../domain/errors/delivery-driver-errors.js";
import {
  DeliveryRoundDepartedError,
  DeliveryRoundNotReadyError,
  DepartureOrderCancelledError,
  DepartureSheetMissingError,
  EmptyDeliveryRoundError,
} from "../domain/errors/delivery-loading-errors.js";
import { DeliveryRoundStaleError } from "../domain/errors/delivery-round-errors.js";

/**
 * **Les refus du départ, redits pour le livreur** (plan « Ma tournée »,
 * MT-D3 v2). Le domaine refuse avec les phrases du dépôt — « déclarez et
 * chargez leurs bacs », « rechargez la composition » —, qui décrivent des
 * gestes que le livreur ne peut pas faire. Le refus est LE MÊME ; seule la
 * phrase change, et le geste de sortie devient « appelez le dépôt » ou
 * « rechargez la page ».
 *
 * Un refus non listé repart tel quel.
 */
export async function asDriverRefusal(
  error: unknown,
  orders: DeliveryOrdersReader,
  orderIds: readonly string[],
): Promise<unknown> {
  if (error instanceof DeliveryRoundNotReadyError) {
    return new DriverRoundNotReadyError(await customersOf(orders, orderIds, error.references));
  }
  if (error instanceof SharedBinToRedoError) {
    return new DriverSharedBinToRedoError(error.codes);
  }
  if (error instanceof DeliveryRoundStaleError) {
    return new DriverRoundStaleError();
  }
  if (error instanceof DeliveryRoundDepartedError) {
    return new DriverRoundDepartedError();
  }
  if (error instanceof EmptyDeliveryRoundError) {
    return new DriverRoundBlockedError("votre tournée n'a aucun arrêt");
  }
  if (
    error instanceof DepartureOrderCancelledError ||
    error instanceof DepartureSheetMissingError
  ) {
    return new DriverRoundBlockedError("une commande de la tournée a été annulée ou n'existe plus");
  }
  return error;
}

/** « CMD-1 Refuge 1950 » — la référence que le dépôt lit, et le client que le livreur connaît. */
async function customersOf(
  orders: DeliveryOrdersReader,
  orderIds: readonly string[],
  references: readonly string[],
): Promise<readonly string[]> {
  const facts = await orders.byIds(orderIds);
  const byReference = new Map(facts.map((order) => [order.reference, order.customerLabel]));
  return references.map((reference) => {
    const customer = byReference.get(reference);
    return customer === undefined || customer === "" ? reference : `${customer} (${reference})`;
  });
}
