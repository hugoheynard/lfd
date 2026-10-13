/**
 * **Le verrou de PLUSIEURS lignes `orders`**, dans un ordre unique (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3, S7).
 *
 * L'émission mensuelle et la constitution d'un lot prennent chacune
 * plusieurs commandes ; l'annulation, « réglée autrement » et la facture
 * carte n'en prennent qu'une (`OrderInvoicingLock`). Deux preneurs de
 * plusieurs lignes qui ne les prendraient pas dans le même ordre pourraient
 * s'attendre l'un l'autre : l'ordre est donc écrit UNE fois, dans l'adaptateur
 * (`ORDER BY id COLLATE "C"`, l'ordre binaire, quelle que soit la collation de
 * la base).
 *
 * Tenu jusqu'à la fin de la transaction : à appeler sous `UnitOfWork.run`.
 * Schéma : `documentation/commandes/annulation/verrous-de-l-annulation.md`.
 */
export abstract class OrderRowsLock {
  abstract lockAll(orderIds: readonly string[]): Promise<void>;
}
