import type { PackingResupply } from "../../domain/entities/packing-resupply.js";
import { PackingResupplyNotDrawnError } from "../../domain/errors/packing-resupply-errors.js";
import type { PackingResupplyRepository } from "../../domain/ports/packing-resupply.repository.js";

/**
 * La fiche de réassort, SOUS VERROU — dans l'unité de travail de l'appelant.
 *
 * @throws {PackingResupplyNotDrawnError} elle n'est pas au colisage.
 */
export async function lockedResupply(
  resupplies: PackingResupplyRepository,
  serviceDay: string,
  resupplyId: string,
): Promise<PackingResupply> {
  const sheet = await resupplies.lock(serviceDay, resupplyId);
  if (sheet === null) {
    throw new PackingResupplyNotDrawnError(resupplyId);
  }
  return sheet;
}
