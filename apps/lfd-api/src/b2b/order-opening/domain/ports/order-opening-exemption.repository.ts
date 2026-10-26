import type { OrderOpeningExemption } from "../order-opening-exemption.js";

/** Port d'**écriture** des exemptions : l'agrégat entier, chargé puis rendu. */
export abstract class OrderOpeningExemptionRepository {
  /** L'exemption, active ou retirée ; `null` si l'identifiant est inconnu. */
  abstract load(id: string): Promise<OrderOpeningExemption | null>;

  /** Crée ou met à jour : une exemption retirée garde sa ligne, archivée. */
  abstract save(exemption: OrderOpeningExemption): Promise<void>;
}
