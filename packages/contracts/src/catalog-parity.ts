/**
 * Contrat de fil du **rapport de parité** — « le miroir est-il fidèle ? ».
 *
 * La plateforme ne lit pas le référentiel : elle en tient un miroir, alimenté
 * par le fil catalogue, et c'est ce miroir que la caisse facture. Un miroir qui
 * décroche facture donc un prix ou un taux que personne n'a décidé, sans que
 * rien ne le signale — tout continue de fonctionner.
 *
 * Le rapport existait côté serveur sans jamais sortir en type partagé : aucun
 * écran ne pouvait l'afficher sans redéclarer sa forme.
 */

/** Un écart sur une valeur, dit avec les DEUX versions — jamais juste « diffère ». */
export interface CatalogParityGap<T> {
  readonly sku: string;
  /** Ce que le référentiel publierait. */
  readonly reference: T;
  /** Ce que la boutique tient aujourd'hui. */
  readonly mirror: T;
}

export interface CatalogParityView {
  readonly referenceCount: number;
  readonly mirrorCount: number;
  /**
   * Publiés par le référentiel, absents du miroir. **Le pire cas** : la boutique
   * ne sait pas les vendre, et le client ne comprend pas pourquoi.
   */
  readonly missing: readonly string[];
  /**
   * Dans le miroir, plus publiés. Ils continuent d'être vendus alors que le
   * référentiel les a retirés — l'autre moitié du même défaut.
   */
  readonly stale: readonly string[];
  /** Le prix canonique a bougé sans que le miroir suive. Chaque ligne est de l'argent. */
  readonly priceGaps: readonly CatalogParityGap<number>[];
  /**
   * Le taux a bougé sans que le miroir suive — un taux révisé dans le PIM et
   * jamais poussé. Chaque ligne est un montant de TVA facturé à tort.
   */
  readonly vatGaps: readonly CatalogParityGap<number | null>[];
  readonly nameGaps: readonly CatalogParityGap<string>[];
  /**
   * `true` **seulement** si rien ne diffère. Un booléen plutôt qu'un score : la
   * question est « le miroir est-il fidèle ? », et elle n'a pas de nuance.
   */
  readonly inSync: boolean;
}
