import type {
  Category,
  Emplacement,
  Product,
  ProductBinding,
  SalesChannels,
  TvaRegime,
} from './models';
import { SEED_PRODUCTS } from './products.seed';
import type { ProjectedFiche } from './publication';

/**
 * La **DB en dur du POC** — versionnée dans le repo, embarquée dans le build.
 *
 * C'est elle qui s'affiche sur une machine vierge (démo GitHub Pages) : aucun
 * backend, aucun localStorage préalable. Les actions du front écrivent ensuite
 * une copie dans le localStorage de la machine ; {@link LocalDb.reset} y revient.
 *
 * Pour figer un nouvel état de démo : « Réinitialiser » puis éditer, exporter le
 * JSON depuis les réglages, et recopier ici.
 */
export interface DbShape {
  readonly tvaRegimes: TvaRegime[];
  readonly categories: Category[];
  readonly products: Product[];
  readonly emplacements: Emplacement[];
  readonly bindings: ProductBinding[];
  /** Dernière empreinte poussée par produit — sert à détecter « déjà à jour ». */
  readonly bindingHashes: Record<string, string>;
  /**
   * L'**état publié** sur Shopify, par handle de fiche : ce qu'on a poussé la
   * dernière fois. La publication rapproche la projection courante de cet état
   * pour en tirer nouvelles / modifiées / à jour / à retirer.
   */
  readonly publishedFiches: Record<string, ProjectedFiche>;
  /** Un push programmé en attente (simulation POC), ou `null`. Remplacé en bloc
   *  (pas muté par contenu) → non `readonly`, contrairement aux collections. */
  scheduledPush: { at: string; handles: string[] } | null;
  readonly shopify: {
    shopDomain: string;
    apiVersion: string;
    isEnabled: boolean;
    updatedAt: string | null;
  };
}

/** À emporter dans les deux boutiques, jamais en salle. */
const EMPORTER_ONLY: SalesChannels = {
  b1: { emporter: true, surPlace: false },
  b2: { emporter: true, surPlace: false },
};

/** À emporter ET sur place dans les deux boutiques — le service complet. */
const ALL_CHANNELS: SalesChannels = {
  b1: { emporter: true, surPlace: true },
  b2: { emporter: true, surPlace: true },
};

function category(
  id: string,
  fr: string,
  slug: string,
  position: number,
  emporterTvaId: string,
  surPlaceTvaId: string,
  channelPreset: SalesChannels = EMPORTER_ONLY,
): Category {
  return {
    id,
    name: { fr },
    slug: { fr: slug },
    parentId: null,
    position,
    isArchived: false,
    channelPreset,
    emporterTvaId,
    surPlaceTvaId,
  };
}

// Régimes : réduit (5,5) à emporter → intermédiaire (10) sur place pour la
// boulange/pâtisserie ; salé & traiteur à 10 partout (consommation immédiate) ;
// chocolat/confiserie au taux normal (20) dans les deux canaux.
export const DB_SEED: DbShape = {
  tvaRegimes: [
    {
      id: 'tva_55',
      name: 'Réduit',
      description: 'Denrées conservables à emporter (boulangerie, pâtisserie, pains).',
      percent: 5.5,
      tag: 'tva-5-5',
    },
    {
      id: 'tva_10',
      name: 'Intermédiaire',
      description: 'Consommation immédiate — sur place ou à emporter (salé, traiteur).',
      percent: 10,
      tag: 'tva-10',
    },
    {
      id: 'tva_20',
      name: 'Normal',
      description: 'Chocolat, confiserie, alcool — taux plein partout.',
      percent: 20,
      tag: 'tva-20',
    },
  ],
  categories: [
    category('cat_vien', 'Viennoiseries', 'viennoiseries', 1, 'tva_55', 'tva_10', ALL_CHANNELS),
    category('cat_pains', 'Pains', 'pains', 2, 'tva_55', 'tva_10', EMPORTER_ONLY),
    category('cat_patis', 'Pâtisseries', 'patisseries', 3, 'tva_55', 'tva_10', ALL_CHANNELS),
    category('cat_sale', 'Salé & traiteur', 'sale-traiteur', 4, 'tva_10', 'tva_10', ALL_CHANNELS),
    category(
      'cat_choco',
      'Chocolat & confiserie',
      'chocolat-confiserie',
      5,
      'tva_20',
      'tva_20',
      EMPORTER_ONLY,
    ),
  ],
  // Catalogue importé du CSV Shopify (92 produits, tous en brouillon).
  products: SEED_PRODUCTS,
  // Deux boutiques : Village (sur place, 12 tables) et Ardroit (emporter seul).
  emplacements: [
    {
      id: 'emp_village',
      name: 'Village',
      clickCollect: true,
      surPlace: true,
      baseUrl: 'https://la-folie-coffee.com/village/commander',
      tables: Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        qrCreated: i < 3,
        ...(i < 3 ? { token: ['k4a1', 'k9b7', 'k2c8'][i] } : {}),
      })),
    },
    {
      id: 'emp_ardroit',
      name: 'Ardroit',
      clickCollect: true,
      surPlace: false,
      baseUrl: 'https://la-folie-coffee.com/ardroit/commander',
      tables: [],
    },
  ],
  bindings: [],
  bindingHashes: {},
  // État publié **vierge** : au premier chargement, toutes les fiches sont
  // « nouvelles » — le point de départ propre du staging (on pousse depuis là).
  publishedFiches: {},
  scheduledPush: null,
  shopify: {
    shopDomain: 'la-folie-coffee.myshopify.com',
    apiVersion: '2026-07',
    isEnabled: false,
    updatedAt: null,
  },
};
