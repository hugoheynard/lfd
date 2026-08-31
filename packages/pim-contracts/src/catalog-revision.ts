import type { FieldDiffView } from "./shopify.js";

/**
 * **Les points d'ancrage de publication du catalogue**, tels qu'un écran les
 * lit.
 *
 * Une ancre est une photographie nommée : ce que le catalogue était à un
 * instant, en entier. Le diff entre deux ancres répond à la seule question qui
 * compte devant un client — « qu'est-ce qui a changé depuis la dernière fois ».
 *
 * `FieldDiffView` est **réutilisé** depuis la réconciliation Shopify plutôt que
 * redéclaré : un champ qui bouge se rend de la même façon, qu'il ait bougé entre
 * deux révisions ou entre nous et une boutique. Deux déclarations du même
 * ensemble finiraient par diverger — c'est déjà arrivé sur les motifs
 * d'exclusion B2B.
 */

/** Une ancre, en une ligne de liste. */
export interface CatalogRevisionSummaryView {
  readonly id: string;
  /** Monotone : elle donne un ordre lisible ("la 12") là où un ULID ne trie que. */
  readonly version: number;
  /** `null` = personne ne l'a nommée. */
  readonly label: string | null;
  readonly hash: string;
  readonly takenAt: string;
  readonly takenBy: string;
  /** Combien d'articles elle fige. */
  readonly articles: number;
}

/** Un article modifié, champ par champ. */
export interface CatalogRevisionItemDiffView {
  readonly sku: string;
  readonly fields: readonly FieldDiffView[];
}

/**
 * Ce qui a changé entre deux ancres.
 *
 * La comparaison suit l'ordre DEMANDÉ : `from` puis `to`. Demander l'inverse
 * inverse « ajouté » et « retiré », et c'est voulu — on regarde parfois en
 * arrière.
 */
export interface CatalogRevisionDiffView {
  readonly from: CatalogRevisionSummaryView;
  readonly to: CatalogRevisionSummaryView;
  /**
   * Ce qui a bougé sans qu'aucun article ne change — le rapport prix pro / prix
   * public. Vide quand il n'a pas bougé.
   */
  readonly header: readonly FieldDiffView[];
  /** Les SKU entrés au catalogue. */
  readonly added: readonly string[];
  /** Les SKU qui n'y sont plus. */
  readonly removed: readonly string[];
  readonly changed: readonly CatalogRevisionItemDiffView[];
}

/**
 * Ce que la pose d'une ancre rend.
 *
 * `created: false` dit que le catalogue n'avait pas bougé : l'ancre rendue est
 * celle qui existait déjà. C'est un RÉSULTAT, pas un échec, et l'écran doit
 * savoir le distinguer — annoncer « posée » ferait croire à une version de plus.
 */
export interface CatalogRevisionTakenView {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
  readonly created: boolean;
}
