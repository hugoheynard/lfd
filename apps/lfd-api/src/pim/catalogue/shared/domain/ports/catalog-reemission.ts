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

  /**
   * Toutes les familles, puis toutes les fiches, puis les règles : la
   * plateforme reçoit la famille d'abord.
   *
   * `progress` est prévenu fiche par fiche — c'est ce qui permet au travail
   * suivi (`pim/channels/b2b-platform/`, 2026-10-18) d'écrire son compte rendu
   * pendant qu'il avance, et de le garder si les règles échouent à la fin.
   *
   * @throws {FamilyReemissionFailedError} une famille n'est pas partie — avant la première fiche.
   * @throws {RulesReemissionFailedError} les règles ne sont pas parties — après toutes les fiches.
   */
  abstract everything(progress?: ReemissionProgress): Promise<ReemissionReport>;
}

/**
 * **Ce qu'une réémission dit en avançant**, fiche par fiche.
 *
 * Attendu à chaque appel : un observateur qui écrit son compte rendu ralentit
 * la réémission plutôt que de laisser des écritures en vol derrière elle.
 */
export abstract class ReemissionProgress {
  abstract productEmitted(productId: string): Promise<void>;
  abstract productFailed(productId: string, cause: unknown): Promise<void>;
}

/** Ce qu'une réémission a fait — rendu à « réémettre tout ». */
export interface ReemissionReport {
  readonly categories: number;
  readonly products: number;
  /** Les fiches dont la transaction a échoué, par identifiant. */
  readonly failedProducts: readonly string[];
}
