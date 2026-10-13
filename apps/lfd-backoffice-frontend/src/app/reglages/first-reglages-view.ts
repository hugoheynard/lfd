import { inject } from '@angular/core';

import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/** Où mène `/reglages` quand aucune vue des Réglages n'est ouverte. */
const NO_REGLAGES_VIEW = '/documentation/facturation';

/**
 * La première vue de l'espace Réglages que les droits ouvrent, dans l'ordre de
 * la table du rail : Commandes, Production, Livraison, Commercial, Sites
 * (Hugo, 2026-10-13). Lue dans le catalogue, pas recopiée : une section
 * déplacée dans la table déplace aussi la destination. Une vue du jour de la
 * Livraison (`/livraison/…`) compte : elle est dans le même rail.
 */
export function firstReglagesView(): string {
  const views = inject(WorkspaceCatalogue).views('exploitation')();
  return views[0]?.link ?? NO_REGLAGES_VIEW;
}
