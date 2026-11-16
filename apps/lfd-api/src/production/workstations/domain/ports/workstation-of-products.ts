/** Un poste en service, dans l'ordre des fiches. */
export interface PlacedWorkstation {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** Le poste de chaque produit demandé, et la liste ordonnée des postes. */
export interface WorkstationsOfProducts {
  /** Les postes en service, dans l'ordre des fiches. */
  readonly workstations: readonly PlacedWorkstation[];
  /**
   * Référence produit → id de son poste. Un produit sans poste est **absent**,
   * jamais présent à `null` : il reste « à ranger ».
   */
  readonly byProduct: ReadonlyMap<string, string>;
}

/**
 * **« À quel poste ces produits vont-ils ? »** — la lecture que les postes
 * publient pour la fiche d'atelier et le dossier du jour (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.1). Une requête sur les produits
 * demandés, jamais la carte entière chargée puis filtrée.
 *
 * Une panne réelle **lève** : c'est à l'appelant de ranger alors comme en
 * mode boutique, et de le dire (§ 3.4).
 */
export abstract class WorkstationOfProducts {
  abstract workstationsOf(productSkus: readonly string[]): Promise<WorkstationsOfProducts>;
}
