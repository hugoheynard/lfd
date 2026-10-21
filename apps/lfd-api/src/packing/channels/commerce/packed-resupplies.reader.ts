/** Ce qu'une fiche de réassort close a réellement emballé : SKU → pièces. */
export type PackedResupplyLines = ReadonlyMap<string, number>;

/**
 * **« Qu'a-t-on réellement emballé pour ces réassorts ? »** (réassort, lot
 * R3b, 2026-10-21 — `reassort-boutiques/plan-reapprovisionnement.md` §13.1
 * point 6, Q4).
 *
 * Le colisage DÉCLARE et IMPLÉMENTE ce port, le commerce le lit pour
 * pré-remplir la réception d'un réassort — même figure que
 * `OrderHandoverHistoryReader` (`handover/channels/commerce/`, 2026-10-08).
 * Le commerce ne lit aucune table du colisage ; `packing → b2b` reste
 * interdit.
 *
 * Par lot : une page de réception porte plusieurs réassorts.
 */
export abstract class PackedResuppliesReader {
  /**
   * Une entrée par identifiant demandé : les quantités emballées par article
   * si la fiche est CLOSE, `null` sinon — pas encore close, ou pas de fiche
   * (point servi sur place, plan non arrêté). Un article absent d'une fiche
   * close n'était pas demandé.
   */
  abstract packedOf(
    resupplyIds: readonly string[],
  ): Promise<ReadonlyMap<string, PackedResupplyLines | null>>;
}
