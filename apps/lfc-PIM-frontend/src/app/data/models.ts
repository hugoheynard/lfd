/**
 * Modèle de domaine du PIM — la source unique des types partagés par les pages,
 * les services locaux et le seed. Les fichiers `*-api.ts` les ré-exportent, si
 * bien que les pages continuent d'importer `type Category` depuis `catalogue-api`
 * sans rien savoir de cette centralisation.
 *
 * Duplication assumée du contrat backend tant que `packages/shared-types`
 * n'existe pas — cf. le POC frontend-only (DB en repo, aucun serveur).
 */

/** Textes traduisibles — `fr` obligatoire, repli sur `fr`. */
export interface LocalizedText {
  fr: string;
  en?: string;
}

export type ProductKind = 'daily' | 'made_to_order' | 'resale';
export type ProductStatus = 'draft' | 'published' | 'archived';

/**
 * Un **régime de TVA** = un taux, = une collection Shopify (Famille A du doc :
 * `tva-5-5`, `tva-10`, `tva-20`). Donnée créable — la base qui porte les
 * dérogations. Une catégorie référence un régime à emporter et un sur place.
 */
export interface TvaRegime {
  id: string;
  /** Nom lisible — « Réduit », « Intermédiaire », « Normal ». */
  name: string;
  /** À quoi il s'applique — note libre pour l'équipe. */
  description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  percent: number;
  /** Tag / handle de la collection Shopify — dérivé du taux (`tva-5-5`). */
  tag: string;
}

/** Ce qu'une boutique propose pour un produit : à emporter et/ou sur place. */
export interface BoutiqueChannels {
  emporter: boolean;
  surPlace: boolean;
}

/**
 * Où et comment un produit se vend, **par boutique**. Chaque boutique décline
 * indépendamment « à emporter » et « sur place » — une vraie matrice
 * boutiques × modes. Le labo ne vend pas (absent de la grille).
 */
export interface SalesChannels {
  b1: BoutiqueChannels;
  b2: BoutiqueChannels;
}

export interface Variant {
  id: string;
  sku: string;
  name: LocalizedText;
  isDefault: boolean;
  isDiscontinued: boolean;
  /** `null` = fiche non renseignée ; `[]` = « aucun allergène » déclaré. */
  allergens: string[] | null;
}

export interface Product {
  id: string;
  sku: string;
  name: LocalizedText;
  kind: ProductKind;
  categoryId: string;
  status: ProductStatus;
  variants: Variant[];
  /** `null` = canaux hérités de la gamme ; sinon override tout-ou-rien. */
  channelsOverride: SalesChannels | null;
}

export interface Category {
  id: string;
  name: LocalizedText;
  slug: LocalizedText;
  parentId: string | null;
  position: number;
  isArchived: boolean;
  /** Défauts dont héritent les produits de la catégorie (sauf override). */
  channelPreset: SalesChannels;
  /** Régime de TVA appliqué aux fiches à emporter / sur place. */
  emporterTvaId: string;
  surPlaceTvaId: string;
}

export type SyncStatus = 'never_pushed' | 'up_to_date' | 'drifted' | 'failed';
export type PushOutcome = 'pushed' | 'unchanged' | 'failed';

export interface ProductBinding {
  productId: string;
  syncStatus: SyncStatus;
  lastPushedAt: string | null;
  lastError: string | null;
}

export interface PushReport {
  productId: string;
  sku: string;
  outcome: PushOutcome;
  message: string;
}

export interface PushSummary {
  mode: 'live' | 'dry-run';
  results: PushReport[];
}

export interface ShopifySettings {
  shopDomain: string;
  apiVersion: string;
  isEnabled: boolean;
  /** Présence du secret — jamais sa valeur. En POC navigateur : toujours `false`. */
  hasToken: boolean;
  mode: 'live' | 'dry-run';
  updatedAt: string | null;
}

export type AllergenScope = 'eu' | 'world';

export interface AllergenEntry {
  code: string;
  /** Libellé granulaire — « Noisette ». */
  label: string;
  incoCategory: string | null;
  /** Libellé d'étiquette — « Fruits à coque ». C'est lui qui fait foi. */
  incoLabel: string | null;
  provisional: boolean;
}

export interface AllergenReference {
  scope: AllergenScope;
  entries: AllergenEntry[];
  hasProvisionalCodes: boolean;
}
