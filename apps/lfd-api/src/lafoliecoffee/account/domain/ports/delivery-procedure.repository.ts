import type { DeliveryProcedure } from "../entities/delivery-procedure.js";

/**
 * Port d'**écriture** de la procédure de livraison : il prend et rend
 * l'agrégat, jamais des colonnes.
 *
 * Le couple `(companyId, addressId)` est le mur : une adresse d'une autre
 * société n'a pas de procédure pour ce port, elle est introuvable.
 */
export abstract class DeliveryProcedureRepository {
  /** La procédure de cette adresse de cette société, ou `null` s'il n'y en a pas encore. */
  abstract loadForAddress(companyId: string, addressId: string): Promise<DeliveryProcedure | null>;

  /**
   * Écrit la procédure **en une transaction** : la racine, la suppression des
   * étapes qui n'y sont plus, et chaque étape présente à sa position `0..n-1`.
   */
  abstract save(procedure: DeliveryProcedure): Promise<void>;
}
