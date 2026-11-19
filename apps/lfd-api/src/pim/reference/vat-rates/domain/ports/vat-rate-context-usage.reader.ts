/**
 * Combien de familles et de fiches visent un taux, **par clé de contexte de
 * vente**. Une clé absente = rien ne le vise dans ce contexte.
 *
 * Une **projection de lecture**, pas un état de l'agrégat : `VatRate` n'a
 * aucun invariant qui dépende de ce compte, et le lui faire porter obligerait
 * à le recompter à chaque `save()` pour rien.
 *
 * Indexé, et non trois champs nommés : le compte dit à l'écran si l'archive
 * sera refusée, et un contexte oublié dans le total offrirait un bouton
 * « Archiver » que l'agrégat refuserait ensuite.
 */
export type VatRateUsage = Readonly<Record<string, number>>;

/**
 * **L'usage de chaque taux, contexte par contexte** — ce que la liste des taux
 * montre, et ce qu'un changement de taux inscrit comme portée au journal.
 *
 * Déclaré ici et implémenté par la racine : les taux réglés appartiennent au
 * catalogue, qu'un référentiel de base ne lit pas. Un port à part du dépôt
 * (ISP) : le dépôt écrit l'agrégat, ce port lit une projection.
 */
export abstract class VatRateContextUsageReader {
  /**
   * Le compte d'usages par id de taux — un seul aller-retour pour toute la
   * liste, et non un `count` par ligne. Les taux sans usage en sont absents.
   */
  abstract usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>>;
}
