import type { ProductStation } from "../entities/product-placements.js";

/** Un poste en service, dans l'ordre des fiches. */
export interface PlacedWorkstation {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** Les postes de chaque produit demandé, et la liste ordonnée des postes. */
export interface WorkstationsOfProducts {
  /** Les postes en service, dans l'ordre des fiches. */
  readonly workstations: readonly PlacedWorkstation[];
  /**
   * Référence produit → tous ses postes, chacun avec `finishes` et la place
   * du produit dans la pile de CE poste (`position: null` : sans place
   * réglée, il vient après ceux qui en ont une), dans aucun ordre promis.
   * Un produit sans poste est **absent**, jamais présent à `[]` : il reste
   * « à ranger ».
   */
  readonly byProduct: ReadonlyMap<string, readonly ProductStation[]>;
}

/**
 * **« À quels postes ces produits vont-ils ? »** — la lecture que les postes
 * publient pour la fiche d'atelier et le dossier du jour (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.1). Une requête sur les produits
 * demandés, jamais la carte entière chargée puis filtrée.
 *
 * Une panne réelle **lève** : c'est à l'appelant de ranger alors comme en
 * mode boutique, et de le dire (§ 3.4).
 */
export abstract class WorkstationOfProducts {
  abstract workstationsOf(productSkus: readonly string[]): Promise<WorkstationsOfProducts>;
}
