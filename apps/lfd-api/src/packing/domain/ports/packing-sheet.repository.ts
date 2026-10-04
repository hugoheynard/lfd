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
  /** @returns `null` si la liste à coliser n'a pas encore livré cette commande. */
  abstract lock(serviceDay: string, orderId: string): Promise<PackingSheet | null>;

  abstract save(sheet: PackingSheet): Promise<void>;
}
