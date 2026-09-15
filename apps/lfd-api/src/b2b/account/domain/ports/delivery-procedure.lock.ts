/**
 * Sérialise les écritures de **la procédure de livraison d'une adresse**.
 *
 * Un port à part, et non une méthode du dépôt : il n'écrit ni ne lit rien. Il
 * POSE un verrou qui vit jusqu'à la fin de la transaction ambiante.
 *
 * Il existe parce que `DeliveryProcedureRepository.save` supprime les étapes
 * absentes de l'agrégat chargé : deux écritures concurrentes qui chargent la
 * même procédure feraient disparaître, à l'enregistrement du second, ce que le
 * premier venait d'ajouter. Le verrou les met l'une derrière l'autre, et la
 * seconde charge ce que la première a commité.
 *
 * ⚠️ Il ne protège que les chemins qui le prennent — aujourd'hui les quatre
 * gestes de `delivery-procedure-editing.ts`, client et staff.
 */
export abstract class DeliveryProcedureLock {
  /**
   * Verrouille la procédure de cette adresse pour la durée de la transaction.
   *
   * Doit être appelé **dans** une `UnitOfWork`, AVANT de charger la procédure :
   * hors transaction le verrou serait relâché aussitôt posé, et un chargement
   * fait avant lui ne verrait pas l'écriture qu'on vient d'attendre.
   */
  abstract acquire(companyId: string, addressId: string): Promise<void>;
}
