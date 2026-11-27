/** Un groupe actif sur une fiche. */
export interface ActiveOptionActivation {
  readonly groupId: string;
  /** `null` = toutes les déclinaisons. */
  readonly variantIds: readonly string[] | null;
}

/**
 * **Les groupes actifs de chaque fiche** — ce que la fiche sait répondre de
 * ses options : le canal le lit pour le fait du catalogue, l'onglet de la
 * fiche pour l'afficher. Suit la transaction ambiante.
 */
export abstract class ProductOptionActivationsReader {
  /** Fiche → ses groupes actifs (non retirés) ; une fiche sans groupe n'a pas d'entrée. */
  abstract activeOf(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ActiveOptionActivation[]>>;
}
