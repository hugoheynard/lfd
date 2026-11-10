/**
 * **Verrouiller une zone le temps de la supprimer** (`documentation/promotions/promotions.md`, § 2.14) : le
 * contrôle « aucune promotion non archivée ne la vise » et la suppression se
 * jouent dans la même transaction, la zone verrouillée — une promotion posée
 * entre les deux attend, puis échoue sur sa clé étrangère au lieu de viser
 * une zone disparue.
 */
export abstract class DeliveryZoneLock {
  /** Sous `UnitOfWork.run` seulement ; une zone absente ne verrouille rien. */
  abstract lock(zoneId: string): Promise<void>;
}
