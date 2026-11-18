import type { PackingTrackingLevel } from "../entities/packing-tracking-level.js";

/**
 * **Le niveau de la fiche d'origine d'un reliquat** (plan des niveaux de
 * suivi du colisage, D3) : un reliquat se colise comme sa commande.
 */
export abstract class OriginTrackingLevelReader {
  /**
   * Le niveau figé de la fiche de rang 1 de la commande, la plus récente
   * jusqu'à `serviceDay` compris.
   *
   * @returns `null` si cette fiche n'a rien de figé, ou si aucune n'existe.
   */
  abstract originLevelOf(orderId: string, serviceDay: string): Promise<PackingTrackingLevel | null>;
}
