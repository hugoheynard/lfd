import type { PurchaseVehicleCandidate } from "../entities/purchase-vehicle-candidate.js";

/**
 * Port d'**écriture** des véhicules candidats : on charge l'agrégat, il se mute
 * par ses méthodes métier, on le rend.
 */
export abstract class PurchaseVehicleCandidateRepository {
  abstract load(id: string): Promise<PurchaseVehicleCandidate | null>;

  /**
   * Écrit l'agrégat (création ou mise à jour).
   * @throws {PurchaseCandidateNameTakenError} l'index partiel a refusé le nom —
   * une course que la lecture préalable n'a pas vue.
   */
  abstract save(candidate: PurchaseVehicleCandidate): Promise<void>;

  /** Un candidat NON archivé porte-t-il déjà ce nom, hors `exceptId` ? */
  abstract activeNameTaken(name: string, exceptId: string | null): Promise<boolean>;
}
