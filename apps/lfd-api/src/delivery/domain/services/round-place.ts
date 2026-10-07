import { capacityGuardOf, type CompositionCapacity } from "./capacity-guard.js";

/**
 * L'état de la place d'une tournée enregistrée :
 * - `fits` : la demande connue tient, et aucune commande n'est inconnue ;
 * - `over` : la part CONNUE déborde déjà — la tournée déborde, c'est sûr ;
 * - `unverified` : la part connue tient, mais des commandes n'ont ni bac ni
 *   estimation — rien n'est promis ;
 * - `unmeasured` : le véhicule n'a pas de cotes, et la tournée porte des bacs.
 */
export type RoundPlaceStatus = "fits" | "over" | "unverified" | "unmeasured";

export interface RoundPlace {
  readonly status: RoundPlaceStatus;
  /** Les commandes de la tournée dont la demande est inconnue. */
  readonly unknownOrders: number;
}

/**
 * **La place d'une tournée déjà composée** (2026-10-07,
 * `documentation/livraisons/inserer-avant-le-depart.md`) : la MÊME garde que
 * « Proposer » (CA4), appliquée à ce qui est enregistré. Elle sert à AVERTIR
 * après une affectation à la main, jamais à la refuser : un geste humain peut
 * savoir mieux que le calcul.
 */
export function roundPlaceOf(input: {
  readonly capacity: CompositionCapacity;
  readonly unknown: ReadonlySet<string>;
  readonly vehicleId: string;
  readonly orderIds: readonly string[];
}): RoundPlace {
  const unknownOrders = input.orderIds.filter((orderId) => input.unknown.has(orderId)).length;
  const carriesBins = input.orderIds.some(
    (orderId) => (input.capacity.bins.get(orderId)?.length ?? 0) > 0,
  );
  const vehicle = input.capacity.vehicles.get(input.vehicleId);
  if (carriesBins && (vehicle === undefined || vehicle.floor === null)) {
    return { status: "unmeasured", unknownOrders };
  }
  const fits = capacityGuardOf(input.capacity).fits(input.vehicleId, [
    { roundId: null, stops: input.orderIds.map((id) => ({ id, window: null })) },
  ]);
  if (!fits) {
    return { status: "over", unknownOrders };
  }
  return { status: unknownOrders > 0 ? "unverified" : "fits", unknownOrders };
}
