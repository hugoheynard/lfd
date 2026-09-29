import type { BinType } from "../domain/entities/bin-type.js";
import {
  BinTypeNameTakenError,
  BinTypeNotFoundError,
} from "../domain/errors/delivery-bin-errors.js";
import type { BinTypeRepository } from "../domain/ports/bin-type.repository.js";

/**
 * Les gardes que plusieurs cas du catalogue des bacs partagent.
 */

/** @throws {BinTypeNotFoundError} */
export async function loadBinType(types: BinTypeRepository, id: string): Promise<BinType> {
  const binType = await types.load(id);
  if (binType === null) {
    throw new BinTypeNotFoundError(id);
  }
  return binType;
}

/**
 * Refuse d'écrire un type EN SERVICE dont le nom est déjà porté par un autre
 * type en service. Un type archivé ne compte pas : l'index partiel ne le voit
 * pas non plus.
 *
 * @throws {BinTypeNameTakenError}
 */
export async function ensureBinTypeNameFree(
  types: BinTypeRepository,
  binType: BinType,
): Promise<void> {
  if (!binType.inService) {
    return;
  }
  if (await types.activeNameTaken(binType.name, binType.id)) {
    throw new BinTypeNameTakenError(binType.name);
  }
}
