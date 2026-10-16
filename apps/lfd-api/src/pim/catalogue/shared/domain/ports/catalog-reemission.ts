/**
 * **Réémettre plusieurs fiches HORS de la transaction du geste** — une
 * transaction par fiche (lot 2a de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, C3 et les
 * corrections après `vitruve`).
 *
 * Port à part de `CatalogEmitter` (ISP) : un geste qui touche UNE fiche émet
 * dans sa transaction ; un geste qui change le prix ou le taux de plusieurs
 * fiches (taux d'une famille, pourcentage d'un taux, rapport pro, référentiel
 * d'allergènes) ne doit pas verrouiller le catalogue entier. Il valide son
 * écriture, puis appelle ceci.
 *
 * ⚠️ **Appelé APRÈS le `uow.run` du geste**, jamais dedans : appelé dedans, il
 * rejoindrait la transaction du geste et la ferait verrouiller toutes les
 * fiches d'un coup — exactement ce qu'il existe pour éviter.
 *
 * ⚠️ **Une fiche en échec n'interrompt pas les autres**, et ne fait pas
 * échouer le geste, qui est déjà validé : elle est journalisée, et « réémettre
 * la fiche » la répare. Lever ici ferait rejouer à l'utilisateur un geste déjà
 * écrit.
 */
export abstract class CatalogReemission {
  /** Les fiches de ces familles (archivées comprises), une transaction chacune. */
  abstract productsOfCategories(categoryIds: readonly string[]): Promise<void>;

  /** Toutes les familles, puis toutes les fiches : la plateforme reçoit la famille d'abord. */
  abstract everything(): Promise<ReemissionReport>;
}

/** Ce qu'une réémission a fait — rendu à « réémettre tout ». */
export interface ReemissionReport {
  readonly categories: number;
  readonly products: number;
  /** Les fiches dont la transaction a échoué, par identifiant. */
  readonly failedProducts: readonly string[];
}
