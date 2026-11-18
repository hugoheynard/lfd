/**
 * **Le verrou d'un contexte de vente**, tenu jusqu'à la fin de l'unité de
 * travail du geste.
 *
 * Il ferme la course entre l'archive d'un contexte et la pose d'un taux dans
 * ce contexte. La clé étrangère ne la ferme pas : l'insertion d'une ligne qui
 * vise le contexte prend un verrou de clé partagé, compatible avec la mise à
 * jour de `archived_at`. Sans ce port, l'archive pouvait compter zéro taux
 * pendant qu'une pose, ayant lu le contexte encore proposé, en écrivait un.
 */
export abstract class SalesContextLock {
  /**
   * Exclusif, AVANT de charger le contexte et de compter ses taux — pour
   * l'archive comme pour la restauration.
   */
  abstract forArchival(key: string): Promise<void>;

  /**
   * Partagé, AVANT de lire les contextes proposés : deux poses ne s'attendent
   * pas, une archive les attend.
   */
  abstract forUse(keys: readonly string[]): Promise<void>;
}
