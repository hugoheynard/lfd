import type { LocalizedText } from "../value-objects/localized-text.js";
import type { ProductRecord } from "./product.repository.js";

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
 * Handles de collection `tva-*` d'une catégorie, **par contexte de vente**. La
 * résolution `catégorie → régime → tag` est faite *dans* le catalogue (qui possède la
 * catégorie et connaît le régime qu'elle vise) ; l'adaptateur Shopify n'en lit que le
 * résultat. `null` = contexte non réglé sur la catégorie.
 */
export interface CategoryTvaTags {
  readonly emporter: string | null;
  readonly surPlace: string | null;
}

/**
 * Une famille telle qu'un **canal** a besoin de la ranger : son identité, sa
 * place dans l'arbre, et le **taux** de TVA — pas le tag.
 *
 * Shopify range par collection, donc il lit un `tag` ; la plateforme B2B calcule
 * une facture, donc elle lit un nombre. Deux besoins distincts sur la même
 * donnée d'origine — résolus tous les deux **ici**, où la catégorie et le régime
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
  /** Taux du régime « à emporter » en %, ou `null` si la famille n'est pas réglée. */
  readonly emporterVatPercent: number | null;
}

export abstract class CatalogueReader {
  abstract publishable(): Promise<ProductRecord[]>;
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
  /** Le tag de collection `tva-*` par contexte pour une catégorie (résout le régime). */
  abstract tvaTags(categoryId: string): Promise<CategoryTvaTags>;
  /** Les familles **non archivées**, avec leur taux de TVA à emporter résolu. */
  abstract channelCategories(): Promise<ChannelCategory[]>;
}
