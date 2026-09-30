import type { PurchaseBinCandidate } from "../domain/entities/purchase-bin-candidate.js";
import type { PurchaseVehicleCandidate } from "../domain/entities/purchase-vehicle-candidate.js";
import {
  PurchaseCandidateNameTakenError,
  PurchaseCandidateNotFoundError,
} from "../domain/errors/delivery-purchase-errors.js";
import type { PurchaseBinCandidateRepository } from "../domain/ports/purchase-bin-candidate.repository.js";
import type { PurchaseVehicleCandidateRepository } from "../domain/ports/purchase-vehicle-candidate.repository.js";

/**
 * Les gardes que plusieurs cas de la bibliothèque d'achat partagent
 * (`plan-bibliotheque-d-achat.md`, lot B1).
 */

/** @throws {PurchaseCandidateNotFoundError} */
export async function loadVehicleCandidate(
  candidates: PurchaseVehicleCandidateRepository,
  id: string,
): Promise<PurchaseVehicleCandidate> {
  const candidate = await candidates.load(id);
  if (candidate === null) {
    throw new PurchaseCandidateNotFoundError("vehicle", id);
  }
  return candidate;
}

/** @throws {PurchaseCandidateNotFoundError} */
export async function loadBinCandidate(
  candidates: PurchaseBinCandidateRepository,
  id: string,
): Promise<PurchaseBinCandidate> {
  const candidate = await candidates.load(id);
  if (candidate === null) {
    throw new PurchaseCandidateNotFoundError("bin", id);
  }
  return candidate;
}

/**
 * Refuse d'écrire un candidat NON archivé dont le nom est déjà porté par un
 * autre candidat non archivé de la même sorte. Un archivé ne compte pas :
 * l'index partiel ne le voit pas non plus.
 *
 * @throws {PurchaseCandidateNameTakenError}
 */
export async function ensureVehicleCandidateNameFree(
  candidates: PurchaseVehicleCandidateRepository,
  candidate: PurchaseVehicleCandidate,
): Promise<void> {
  if (candidate.inLibrary && (await candidates.activeNameTaken(candidate.name, candidate.id))) {
    throw new PurchaseCandidateNameTakenError("vehicle", candidate.name);
  }
}

/** @throws {PurchaseCandidateNameTakenError} cf. {@link ensureVehicleCandidateNameFree}. */
export async function ensureBinCandidateNameFree(
  candidates: PurchaseBinCandidateRepository,
  candidate: PurchaseBinCandidate,
): Promise<void> {
  if (candidate.inLibrary && (await candidates.activeNameTaken(candidate.name, candidate.id))) {
    throw new PurchaseCandidateNameTakenError("bin", candidate.name);
  }
}
