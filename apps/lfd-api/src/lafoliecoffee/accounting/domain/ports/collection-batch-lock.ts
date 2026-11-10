/**
 * **Le verrou d'UN lot**, tenu jusqu'à la fin de la transaction
 * (`SELECT … FOR UPDATE` sur sa ligne `collection_batch`).
 *
 * Ferme la course entre « La banque a rejeté ce fichier » et l'enregistrement
 * d'un retour sur une de ses lignes (plan `plan-lot-rejete-par-la-banque.md`,
 * § 0.3) : les deux prennent ce verrou AVANT de lire l'état du lot, donc le
 * second lit ce que le premier a écrit. Sans lui, un retour enregistré
 * pendant le rejet trouverait ses commandes déjà rendues à prélever.
 *
 * À appeler sous `UnitOfWork.run`.
 */
export abstract class CollectionBatchLock {
  abstract lock(batchId: string): Promise<void>;
}
