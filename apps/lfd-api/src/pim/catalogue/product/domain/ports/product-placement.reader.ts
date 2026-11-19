/** Où une fiche se tient : sa famille, ses dérogations de taux, ses références. */
export interface ProductPlacement {
  readonly productId: string;
  readonly categoryId: string;
  /** Ses taux PROPRES, par clé de contexte (identifiants de taux) — ses dérogations seules. */
  readonly vatByContext: Readonly<Record<string, string>>;
  /** Les références de ses déclinaisons, arrêtées comprises. */
  readonly variantSkus: readonly string[];
}

/**
 * **Où se tient une fiche** — ce qu'il faut pour remonter sa lignée sans
 * charger l'agrégat : sa famille, ses dérogations de taux et les références
 * de ses déclinaisons.
 *
 * Port de LECTURE à part (ISP) : l'historique ne lit que ça, et la fiche
 * entière (`ProductRecordsReader`) le ferait payer l'éditorial, les tarifs et
 * la fiche réglementaire de chaque déclinaison.
 */
export abstract class ProductPlacementReader {
  /** `null` : aucune fiche sous cet identifiant. */
  abstract placementOf(productId: string): Promise<ProductPlacement | null>;
}
