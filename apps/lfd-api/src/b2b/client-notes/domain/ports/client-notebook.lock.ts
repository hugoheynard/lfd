/**
 * Sérialise les écritures du **carnet de notes d'une société**.
 *
 * Un port à part, et non une méthode du dépôt : il n'écrit ni ne lit rien. Il
 * POSE un verrou qui vit jusqu'à la fin de la transaction ambiante.
 *
 * Il existe parce que `ClientNotebookRepository.save` supprime les notes
 * absentes de l'agrégat chargé : deux écritures concurrentes qui chargent le
 * même carnet feraient disparaître, à l'enregistrement de la seconde, la note
 * que la première venait d'ajouter. Même raison que `DeliveryProcedureLock`.
 *
 * ⚠️ Il ne protège que les chemins qui le prennent — les quatre gestes de
 * `client-notebook-editing.ts`.
 */
export abstract class ClientNotebookLock {
  /**
   * Verrouille le carnet de cette société pour la durée de la transaction.
   *
   * Doit être appelé **dans** une `UnitOfWork`, AVANT de charger le carnet.
   */
  abstract acquire(companyId: string): Promise<void>;
}
