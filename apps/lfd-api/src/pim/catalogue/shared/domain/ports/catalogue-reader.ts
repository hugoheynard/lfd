import type { LocalizedText } from "../value-objects/localized-text.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";

/**
 * **Le seul point d'entrée des adaptateurs de canal dans le catalogue.**
 *
 * Règle d'ADR-13 : un module ne lit jamais les tables d'un autre. L'adaptateur Shopify
 * ne connaît ni `PrismaProductRepository` ni la table `product` — il demande ici.
 *
 * Test de validation : si on supprimait le module Shopify, le catalogue compilerait
 * encore. L'inverse n'est pas vrai, et c'est voulu — la dépendance va du bord vers le
 * centre, jamais l'inverse.
 */
/**
 * **Taux** de TVA d'une catégorie, par contexte de vente. La résolution
 * `catégorie → taux → taux` est faite *dans* le catalogue (qui possède la
 * catégorie et connaît le taux qu'elle vise) ; l'adaptateur n'en lit que le
 * résultat. `null` = contexte non réglé sur la catégorie.
 *
 * Un **taux**, et non un handle `tva-*` comme auparavant : le catalogue rendait
 * du vocabulaire Shopify à tous ses canaux, alors qu'un seul range par
 * collection. Chacun dérive maintenant ce dont il a besoin — Shopify un handle,
 * la boutique B2B un nombre à facturer.
 */
export interface CategoryTvaPercents {
  readonly emporter: number | null;
  readonly surPlace: number | null;
}

/**
 * Une famille telle qu'un **canal** a besoin de la ranger : son identité, sa
 * place dans l'arbre, et le **taux** de TVA — pas le tag.
 *
 * Shopify range par collection, donc il lit un `tag` ; la plateforme B2B calcule
 * une facture, donc elle lit un nombre. Deux besoins distincts sur la même
 * donnée d'origine — résolus tous les deux **ici**, où la catégorie et le taux
 * sont connus, plutôt que dans chaque adaptateur.
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
  /** Taux du taux « à emporter » en %, ou `null` si la famille n'est pas réglée. */
  readonly emporterVatPercent: number | null;
}

export abstract class CatalogueReader {
  abstract publishable(): Promise<ProductRecord[]>;
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
  /** Le taux de TVA par contexte pour une catégorie (résout le taux). */
  abstract tvaPercents(categoryId: string): Promise<CategoryTvaPercents>;
  /** Les familles **non archivées**, avec leur taux de TVA à emporter résolu. */
  abstract channelCategories(): Promise<ChannelCategory[]>;
}
