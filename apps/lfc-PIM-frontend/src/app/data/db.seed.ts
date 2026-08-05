import type { Product, ProductBinding } from './models';
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
  readonly products: Product[];
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

// Familles, régimes de TVA et emplacements vivent désormais côté backend
// (`catalogue/categories`, `commerce/tva-regimes`, `locations/emplacements`) — ils
// ne sont plus semés ici. Ne restent en local que les produits (pas encore migrés
// côté publication) et l'état Shopify simulé.
export const DB_SEED: DbShape = {
  // Catalogue importé du CSV Shopify (92 produits, tous en brouillon).
  products: SEED_PRODUCTS,
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
