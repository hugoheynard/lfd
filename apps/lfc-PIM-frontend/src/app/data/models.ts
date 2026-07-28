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
  /** Handle Shopify — pilote l'URL, jamais changé après création (SEO). */
  slug?: LocalizedText;
  /** Prix de vente TTC, en euros. */
  priceEur?: number;
  /** Description courte (fiche produit + listes). */
  descriptionFr?: string;
  /** Poids en grammes, quand le produit se vend au format/poids. */
  weightGrams?: number | null;
  /** Étiquettes de workflow interne : `a-decrire`, `prix-a-verifier`,
   *  `titre-a-verifier`, `tva-a-valider` — ce qui reste à compléter. */
  workflowFlags?: string[];
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

/**
 * L'état **distant** d'une collection Shopify, tel qu'on le lit sur la boutique.
 * Le PIM en garde un miroir local (POC sans backend) : c'est ce miroir que la
 * réconciliation compare aux régimes de TVA voulus (Famille A). Le `handle` — le
 * tag dérivé du taux (`tva-5-5`) — est la clé de rapprochement.
 */
export interface ShopifyCollection {
  /** Identifiant côté Shopify (gid simulé en POC). */
  id: string;
  /** Handle = tag de collection (`tva-5-5`), la clé de rapprochement. */
  handle: string;
  title: string;
  /** Fiches rattachées côté boutique — `0` = collection poussée vide. */
  productCount: number;
  createdAt: string;
}

/**
 * Une **table** d'un emplacement en click & collect sur place : elle porte une
 * URL dérivée (`baseUrl?table=N`) et sait si son QR code a été généré.
 */
export interface EmplacementTable {
  /** Numéro de table — verrouillé une fois créé (identité de l'URL). */
  number: number;
  qrCreated: boolean;
  /** Token rotatif du QR : le régénérer produit un nouveau code et invalide
   *  l'ancien (`…?table=N&k=token`). Absent tant qu'aucun QR n'est généré. */
  token?: string;
}

/**
 * Un **emplacement** (boutique / point de vente). Il expose ses modes de vente ;
 * s'il fait « sur place », son nombre de tables ouvre une section click & collect
 * par table (une URL + un QR par table).
 */
export interface Emplacement {
  id: string;
  name: string;
  /** Vente à emporter en ligne. */
  clickCollect: boolean;
  /** Consommation sur place (ouvre les tables). */
  surPlace: boolean;
  /** URL de base du click & collect de la boutique. */
  baseUrl: string;
  /** Tables (si sur place) — dérivées du nombre de tables. */
  tables: EmplacementTable[];
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
