/**
 * Modèle de domaine du PIM — la source unique des types partagés par les pages,
 * les services locaux et le seed. Les fichiers `*-api.ts` les ré-exportent, si
 * bien que les pages continuent d'importer `type Category` depuis `catalogue-api`
 * sans rien savoir de cette centralisation.
 *
 * Duplication assumée du contrat backend tant que `packages/shared-types`
 * n'existe pas — cf. le POC frontend-only (DB en repo, aucun serveur).
 */

/**
 * Textes traduisibles. Le vocabulaire vient du CONTRAT — une seule liste de
 * locales pour le monorepo, et ouvrir une langue est une entrée de plus là-bas,
 * pas un champ de plus ici.
 *
 * Import de TYPES uniquement pour `LocalizedText` ; `LOCALES` et compagnie sont
 * des valeurs, donc réexportées depuis le point d'entrée paresseux qui les
 * utilise — `@lfd/pim-contracts` tire zod, qui n'a rien à faire dans le bundle
 * initial.
 */
import type { LocalizedText } from '@lfd/pim-contracts';

export type { Locale, LocalizedText, TranslatedLocale } from '@lfd/pim-contracts';

export type ProductKind = 'daily' | 'made_to_order' | 'resale';
export type ProductStatus = 'draft' | 'published' | 'archived';

/**
 * Un **taux de TVA** = un taux, = une collection Shopify (Famille A du doc :
 * `tva-5-5`, `tva-10`, `tva-20`). Donnée créable — la base qui porte les
 * dérogations. Une catégorie référence un taux à emporter et un sur place.
 */
export interface VatRate {
  id: string;
  /** Nom lisible — « Réduit », « Intermédiaire », « Normal ». */
  name: string;
  /** À quoi il s'applique — note libre pour l'équipe. */
  description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  percent: number;
  /** Combien de familles le visent — rendu par l'API, jamais recalculé ici. */
  usage: VatRateUsage;
}

/**
 * Le compte d'usages d'un taux, **par clé de contexte de vente**. Clé absente =
 * aucune famille ne le vise dans ce contexte.
 *
 * Il nommait deux modes et en oubliait un troisième : un taux que seule la
 * plateforme B2B visait s'affichait « 0 famille », donc supprimable, et la base
 * refusait après le clic.
 */
export type VatRateUsage = Readonly<Record<string, number>>;

/** Ce qu'une boutique propose pour un produit : à emporter et/ou sur place. */
export interface BoutiqueChannels {
  emporter: boolean;
  surPlace: boolean;
}

/**
 * Où et comment un produit se vend.
 *
 * Les emplacements sont une **donnée** : la carte est indexée par identifiant,
 * jamais par des clés fixes. C'était `{ b1, b2 }`, avec des libellés en dur qui
 * avaient fini par désigner une boutique absente du référentiel.
 *
 * Le B2B reste un booléen à part — la plateforme n'est pas un emplacement.
 */
export interface SalesChannels {
  boutiques: Record<string, BoutiqueChannels>;
  b2b: boolean;
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
  /**
   * La **dérogation** de cette fiche au taux de sa famille, par clé de contexte.
   * Vide = elle hérite. Ce n'est PAS le taux effectif : l'écran compose les deux
   * pour pouvoir dire d'où vient chaque taux.
   */
  tvaByContext: Readonly<Record<string, string>>;
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
  /** Taux de TVA appliqué par canal de vente. `''` = non réglé. */
  /**
   * Les taux visés, **par clé de contexte de vente**. Clé absente = non réglé.
   *
   * C'étaient trois champs nommés : ajouter un contexte demandait de les
   * modifier ici, dans le mapper, dans le panneau et dans deux écrans. Le
   * registre vit en base ; le front l'itère.
   */
  tvaByContext: Readonly<Record<string, string>>;
  /**
   * Fiches **actives** portées par la famille. Une famille qui en porte ne peut
   * pas être archivée : le compte permet de le dire AVANT le clic, plutôt que
   * de laisser le refus du backend l'apprendre après.
   */
  activeProductCount: number;
}

// Types de synchro Shopify (SyncStatus, PushOutcome, ProductBinding, PushReport,
// PushSummary) migrés vers `@lfd/pim-contracts` — ré-exportés par `shopify-api`.

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
  /**
   * Combien de **familles** cochent cet emplacement dans leurs canaux.
   *
   * Vient de l'API pour que l'écran DISE qu'une suppression échouera avant
   * qu'on clique : le référentiel refuse de supprimer un point de vente encore
   * vendeur. Même raison que le compte de fiches sur une famille.
   */
  usedByCategories: number;
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
