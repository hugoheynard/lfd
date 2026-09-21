import type { LocalizedText } from "../value-objects/localized-text.js";
import type { SalesChannels } from "../value-objects/sales-channels.js";
import type { ProductEditorialView } from "../../../product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";

/**
 * **Le seul point d'entrée des adaptateurs de canal dans le catalogue.**
 *
 * Règle d'ADR-13 : un module ne lit jamais les tables d'un autre. Un adaptateur de
 * canal ne connaît ni `PrismaProductRepository` ni la table `product` — il demande ici.
 *
 * 🔴 **Le test de validation a été PASSÉ pour de vrai le 2026-09-21.** Ce
 * commentaire posait l'expérience en hypothèse — « si on supprimait le module
 * Shopify, le catalogue compilerait encore ». Ce module a été supprimé
 * ([`plan-un-seul-canal-deux-prix.md`](../../../../../../../documentation/pim/plan-un-seul-canal-deux-prix.md)),
 * et le catalogue a compilé sans qu'une ligne y change. Une découpe qui tient
 * n'est plus une intention, c'est un fait mesuré.
 *
 * L'inverse reste faux, et c'est voulu — la dépendance va du bord vers le
 * centre, jamais l'inverse.
 */
/**
 * **Taux** de TVA d'une catégorie, par contexte de vente. La résolution
 * `catégorie → taux → taux` est faite *dans* le catalogue (qui possède la
 * catégorie et connaît le taux qu'elle vise) ; l'adaptateur n'en lit que le
 * résultat. `null` = contexte non réglé sur la catégorie.
 *
 * Un **taux**, et non un handle `tva-*` comme auparavant : le catalogue rendait
 * à tous ses canaux le vocabulaire d'UN d'entre eux, celui qui rangeait par
 * collection. Chacun dérivait ensuite ce dont il avait besoin.
 *
 * ⚠️ Ce canal-là est parti le 2026-09-21, et c'est précisément ce déplacement
 * qui a rendu son retrait indolore : le handle vivait chez lui, pas ici. La
 * règle vaut pour le suivant — le catalogue rend la donnée, jamais le mot d'un
 * canal.
 */
export type CategoryVatPercents = Readonly<Record<string, number>>;

/**
 * Une famille telle qu'un **canal** a besoin de la ranger : son identité, sa
 * place dans l'arbre, et le **taux** de TVA — pas le tag.
 *
 * La plateforme B2B calcule une facture, donc elle lit un **nombre**. Un canal
 * qui rangeait par collection lisait, lui, un `tag` — deux besoins distincts sur
 * la même donnée d'origine, résolus tous les deux **ici**, où la catégorie et le
 * taux sont connus, plutôt que dans chaque adaptateur. Il n'en reste qu'un
 * depuis le 2026-09-21 ; la résolution reste ici, parce que c'est le seul
 * endroit qui connaît les deux bouts.
 *
 * Le texte reste `LocalizedText` : l'aplatissement vers une langue est une
 * décision de canal, pas du catalogue.
 */
export interface ChannelCategory {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  /**
   * Les taux de la famille en %, par clé de contexte. Clé absente = non réglé.
   */
  readonly vatByContext: CategoryVatPercents;
}

export abstract class CatalogueReader {
  abstract publishable(): Promise<ProductRecord[]>;
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
  /**
   * Le taux **effectif** de chaque produit, par contexte : sa dérogation
   * par-dessus celle de sa famille, résolue en pourcentages.
   *
   * Par PRODUIT et non par catégorie : depuis qu'une fiche peut déroger, une
   * réponse par famille ne dit plus ce qu'on facture. Les deux canaux passent
   * par ici — le seul endroit où la règle « produit d'abord, famille ensuite »
   * est écrite.
   *
   * Une famille inconnue est un REFUS (`CategoryNotFoundError`), pas une
   * absence de taux : deux causes distinctes (un rattachement cassé / un taux à
   * régler) ne doivent pas rendre le même symptôme.
   */
  abstract vatPercents(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>>;

  /**
   * Où chaque produit se vend **réellement** : sa propre matrice s'il en a une,
   * celle de sa famille sinon.
   *
   * Par PRODUIT, comme les taux, et pour la même raison : depuis qu'une fiche
   * peut redéfinir ses canaux, la matrice de la famille ne dit plus où elle se
   * vend. C'est le canal qui décide ensuite ce qu'il en fait — la plateforme
   * B2B écarte de sa boutique ce qui n'y est pas vendu.
   *
   * Une famille inconnue est un REFUS, comme pour les taux.
   */
  abstract effectiveChannels(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, SalesChannels>>;
  /** Les familles **non archivées**, avec leurs taux résolus, par contexte. */
  abstract channelCategories(): Promise<ChannelCategory[]>;
  /**
   * La couche éditoriale de plusieurs produits, indexée par identifiant.
   *
   * Elle ne voyage PAS dans `ProductRecord` : c'est un satellite optionnel du produit,
   * avec sa propre table et son propre rythme de vie. La coller à l'instantané du
   * produit obligerait tout lecteur à la charger, y compris ceux qui ne la lisent pas.
   */
  abstract editorials(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProductEditorialView>>;
}
