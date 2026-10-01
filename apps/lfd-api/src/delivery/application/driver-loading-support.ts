import { DriverRoundNotFoundError } from "../domain/errors/delivery-driver-errors.js";
import type { DriverRoundWall } from "../domain/ports/driver-round-wall.js";

/**
 * **Le mur du chargement du livreur** (`parcours-du-livreur.md`, PL1) : la
 * tournée doit lui être affectée, sinon 404 — la même phrase que « Ma
 * tournée », qui ne confirme pas qu'elle existe.
 *
 * @throws {DriverRoundNotFoundError}
 */
export async function assertDriverRound(
  wall: DriverRoundWall,
  staffUserId: string,
  roundId: string,
): Promise<void> {
  if (!(await wall.isAssigned(staffUserId, roundId))) {
    throw new DriverRoundNotFoundError();
  }
}
