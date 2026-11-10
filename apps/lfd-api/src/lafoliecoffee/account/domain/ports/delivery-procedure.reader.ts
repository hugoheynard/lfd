import type { DeliveryProcedureView } from "@lfd/contracts";

/**
 * Port de **lecture** de la procédure de livraison, prête pour l'écran.
 *
 * Distinct du dépôt : l'écran veut un numéro et une révision de photo, que
 * l'agrégat n'a aucune raison de porter. Le mur d'appartenance est vérifié en
 * amont par le handler ; le `companyId` reste dans la requête.
 */
export abstract class DeliveryProcedureReader {
  /** La procédure de l'adresse — `steps` vide quand elle n'en a pas. */
  abstract read(companyId: string, addressId: string): Promise<DeliveryProcedureView>;
}
