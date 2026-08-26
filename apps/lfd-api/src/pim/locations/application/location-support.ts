import { LocationNotFoundError } from "../domain/errors/locations-errors.js";
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
