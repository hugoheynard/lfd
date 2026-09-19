import type { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";

/**
 * Le nom du point de retrait qu'une règle vise, tel qu'il est au moment du
 * geste — pour que le fait le garde (D5 du plan des phrases, 2026-09-19).
 *
 * `null` pour la règle par défaut (aucun point), et `null` aussi pour un point
 * que l'annuaire ne connaît pas : une règle ne porte pas de clé étrangère, la
 * liste le tolère déjà (`pickupLabel: null`), et ce n'est pas au journal de
 * refuser le geste. Le fait citera alors le point par son seul id.
 *
 * `resolve(null)` rendrait le point par DÉFAUT : il n'est jamais appelé sans
 * identifiant.
 */
export async function cutoffPickupName(
  pickups: PickupAddressRepository,
  pickupAddressId: string | null,
): Promise<string | null> {
  if (pickupAddressId === null) {
    return null;
  }
  const point = await pickups.resolve(pickupAddressId);
  return point === null ? null : point.label;
}
