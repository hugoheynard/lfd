import {
  LocationNameTakenError,
  LocationNotFoundError,
} from "../domain/errors/locations-errors.js";
import type { Location } from "../domain/entities/location.js";
import { LocationRepository } from "../domain/ports/location.repository.js";

/**
 * Charge un emplacement, ou refuse. Le seul partage qui reste ici : `cleanName`
 * et `requireTable` ont rejoint l'agrégat, qui est le lieu de ces règles.
 */
export async function requireLocation(
  locations: LocationRepository,
  id: string,
): Promise<Location> {
  const location = await locations.findById(id);
  if (location === null) {
    throw new LocationNotFoundError(id);
  }
  return location;
}

/**
 * Exige que le nom soit **libre**.
 *
 * L'agrégat ne voit que lui-même : il sait exiger un nom non vide, pas qu'un
 * voisin le porte déjà. Même forme que « le parent doit exister » côté famille
 * — une règle qui parle des autres, donc tenue par le handler.
 */
export async function requireFreeName(
  locations: LocationRepository,
  name: string,
  exceptId: string | null,
): Promise<void> {
  const holder = await locations.findByName(name);
  if (holder !== null && holder.id !== exceptId) {
    throw new LocationNameTakenError(name, holder.id);
  }
}
