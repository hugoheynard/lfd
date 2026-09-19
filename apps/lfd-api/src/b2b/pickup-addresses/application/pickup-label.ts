import { PickupAddressNotFoundError } from "../domain/pickup-errors.js";
import type { PickupAddressRepository } from "../domain/pickup-address.repository.js";

/**
 * Le nom d'un point, lu AVANT le geste qui le vise — pour que le fait le garde
 * (D6 du plan des phrases, 2026-09-19) : après un retrait, il n'y a plus rien
 * à lire.
 *
 * `resolve(null)` rendrait le point par DÉFAUT : on ne lui passe donc jamais
 * qu'un identifiant réel, et un point inconnu est refusé ici comme le geste
 * l'aurait refusé ensuite.
 *
 * @throws {PickupAddressNotFoundError} l'`id` ne désigne aucun point.
 */
export async function pickupLabel(pickups: PickupAddressRepository, id: string): Promise<string> {
  const point = await pickups.resolve(id);
  if (point === null) {
    throw new PickupAddressNotFoundError(id);
  }
  return point.label;
}
