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

/**
 * Un champ qui a bougé, **et qui l'a fait bouger**.
 *
 * L'auteur ne vient pas de la révision — elle sait seulement qui l'a POSÉE —
 * mais du journal, fait par fait. `by` à `null` distingue deux choses qu'on ne
 * doit pas confondre : `attributed: false` veut dire « personne ne sait », et
 * `attributed: true` avec `by: null` veut dire « le système », ce qui est une
 * réponse.
 */
export interface AttributedFieldDiffView extends FieldDiffView {
  /** `false` = aucun fait du journal ne revendique ce champ. */
  readonly attributed: boolean;
  /**
   * Un fait GLOBAL de l'intervalle qui a pu altérer ce champ — un taux de TVA
   * révisé, une famille reclassée. `null` = aucun.
   *
   * Ce n'est pas un auteur, et c'est toute la nuance : le fait a PU causer la
   * ligne, il ne la revendique pas. Le présenter comme une attribution ferait
   * porter à quelqu'un un changement qu'il n'a peut-être pas provoqué.
   */
  readonly cause: string | null;
  /** Le nom au moment de l'acte. `null` = le système, ou non attribué. */
  readonly by: string | null;
  /** Quand, en ISO. `null` = non attribué. */
  readonly at: string | null;
}

/** Un article modifié, champ par champ. */
export interface CatalogRevisionItemDiffView {
  readonly sku: string;
  readonly fields: readonly AttributedFieldDiffView[];
}

/**
 * Ce qui a changé entre deux ancres.
 *
 * La comparaison suit l'ordre DEMANDÉ : `from` puis `to`. Demander l'inverse
 * inverse « ajouté » et « retiré », et c'est voulu — on regarde parfois en
 * arrière.
 */
/**
 * Un fait de PARAMÉTRAGE tombé dans l'intervalle.
 *
 * Changer un taux de TVA est un seul fait qui altère cent articles. Aucun de
 * ces cent produits n'a de fait à lui : sans cette liste, l'écran répéterait
 * cent fois « auteur non défini par une action locale » pour une décision prise une fois.
 */
export interface CatalogRevisionCauseView {
  readonly type: string;
  /** Ce que le fait dit de lui-même : « Intermédiaire : 10 → 10.1 ». */
  readonly label: string;
  readonly by: string | null;
  readonly at: string;
  /** Les champs d'article que ce fait peut avoir altérés. */
  readonly explains: readonly string[];
  /**
   * **Sa portée au moment de l'acte** — « b2b : 1, eatIn : 1 ».
   *
   * C'est elle qui transforme une ligne d'historique en explication : sans
   * elle, l'écran dit qu'un taux a bougé sans dire ce que ça a touché, et c'est
   * exactement la question devant cinquante articles modifiés. Vide = portée
   * non enregistrée, ce qui n'est pas « ça n'a rien touché ».
   */
  readonly blast: Readonly<Record<string, number>>;
}

export interface CatalogRevisionDiffView {
  readonly from: CatalogRevisionSummaryView;
  readonly to: CatalogRevisionSummaryView;
  /**
   * Ce qui a été réglé pendant l'intervalle et qui peut expliquer des lignes
   * sans auteur. Vide = rien de global n'a bougé.
   */
  readonly causes: readonly CatalogRevisionCauseView[];
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
