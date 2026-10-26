import type { PackingSheet } from "../entities/packing-sheet.js";

/**
 * **Les bacs du colisage, en écriture** — l'agrégat `PackingSheet`, chargé et
 * rendu entier (§3.1).
 *
 * `lock` charge SOUS VERROU (`SELECT … FOR UPDATE` sur la ligne du bac), dans
 * l'unité de travail de l'appelant : deux postes sur le même bac s'ordonnent,
 * et la fermeture n'a pas besoin d'écriture conditionnée.
 */
export abstract class PackingSheetRepository {
  /**
   * La feuille d'un envoi `(jour, commande, rang)` — le rang depuis L3b (plan
   * E7 reliquat, choix 5) : un reliquat du même jour a sa propre feuille.
   *
   * @returns `null` si la liste à coliser n'a pas encore livré cet envoi.
   */
  abstract lock(serviceDay: string, orderId: string, rank: number): Promise<PackingSheet | null>;

  /**
   * Le bac le plus récent d'un envoi, sous verrou — celui que la décision
   * du départ incomplet autorise (E6b), qui ne connaît pas le jour.
   * `null` si la liste ne l'a jamais inscrit.
   */
  abstract lockLatestOf(orderId: string, rank: number): Promise<PackingSheet | null>;

  abstract save(sheet: PackingSheet): Promise<void>;
}
