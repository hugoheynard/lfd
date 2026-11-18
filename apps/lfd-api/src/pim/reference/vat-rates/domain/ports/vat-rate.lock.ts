/**
 * **Le verrou d'un taux de TVA**, tenu jusqu'à la fin de l'unité de travail du
 * geste.
 *
 * Il ferme la course entre l'archive d'un taux et sa pose sur une famille ou
 * une fiche. La clé étrangère ne la ferme pas : l'insertion d'une ligne qui
 * vise le taux prend un verrou de clé partagé, compatible avec la mise à jour
 * de `archived_at`. Sans ce port, l'archive pouvait compter zéro usage pendant
 * qu'une pose, ayant lu le taux encore en service, l'écrivait — un taux
 * archivé et porté, c'est-à-dire une fiche facturée à un taux que plus
 * personne ne peut choisir.
 *
 * Les deux modes s'excluent : l'archive attend la fin des poses en cours, la
 * pose attend la fin d'une archive en cours puis relit l'état validé.
 */
export abstract class VatRateLock {
  /**
   * Exclusif, AVANT de charger le taux et de compter ce qui le porte — pour
   * l'archive comme pour la restauration.
   */
  abstract forArchival(rateId: string): Promise<void>;

  /**
   * Partagé, AVANT de vérifier que les taux posés sont en service : deux poses
   * ne s'attendent pas, une archive les attend.
   */
  abstract forUse(rateIds: readonly string[]): Promise<void>;
}
