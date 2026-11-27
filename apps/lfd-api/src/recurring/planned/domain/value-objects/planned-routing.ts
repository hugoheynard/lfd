import { InvalidPlannedRoutingError } from "../errors/planned-column-errors.js";
import type { PlannedRouting } from "../entities/planned-column.js";

/**
 * Un acheminement remis en forme : une livraison exige son adresse et n'a pas
 * de point de retrait ; un retrait n'a pas d'adresse.
 *
 * @throws {InvalidPlannedRoutingError} une livraison sans adresse.
 */
export function normalizeRouting(routing: PlannedRouting): PlannedRouting {
  if (routing.method === "delivery") {
    if (routing.deliveryAddress === null) {
      throw new InvalidPlannedRoutingError("Une livraison exige une adresse.");
    }
    return { ...routing, pickupAddressId: null };
  }
  return { ...routing, deliveryAddress: null };
}

/** Deux acheminements disent-ils la même chose ? */
export function sameRouting(a: PlannedRouting, b: PlannedRouting): boolean {
  return (
    a.method === b.method &&
    a.pickupAddressId === b.pickupAddressId &&
    a.window.start === b.window.start &&
    a.window.end === b.window.end &&
    stableJson(a.deliveryAddress) === stableJson(b.deliveryAddress)
  );
}

/** Une adresse relue et une adresse reçue n'ont pas forcément leurs clés dans le même ordre. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
