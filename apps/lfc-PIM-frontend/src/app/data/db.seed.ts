import type { ProjectedFiche } from './publication';

/**
 * Le **store local résiduel du POC** — versionné dans le repo, embarqué dans le
 * build. Catalogue, familles, TVA, emplacements et bindings Shopify vivent tous
 * côté backend ; il ne reste ici que l'**état de publication simulé** (ce qu'on
 * a « poussé » et les push programmés), faute de backend de staging Shopify.
 */
export interface DbShape {
  /**
   * L'**état publié** sur Shopify, par handle de fiche : ce qu'on a poussé la
   * dernière fois. La publication rapproche la projection courante de cet état
   * pour en tirer nouvelles / modifiées / à jour / à retirer.
   */
  readonly publishedFiches: Record<string, ProjectedFiche>;
  /** Un push programmé en attente (simulation POC), ou `null`. Remplacé en bloc
   *  (pas muté par contenu) → non `readonly`, contrairement aux collections. */
  scheduledPush: { at: string; handles: string[] } | null;
}

// État publié **vierge** : au premier chargement, toutes les fiches sont
// « nouvelles » — le point de départ propre du staging (on pousse depuis là).
export const DB_SEED: DbShape = {
  publishedFiches: {},
  scheduledPush: null,
};
