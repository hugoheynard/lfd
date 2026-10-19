import { inject } from '@angular/core';

import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/** Où mène `/admin` quand aucune vue n'est lue : le garde de la vue redirigera. */
const NO_ADMIN_VIEW = '/admin/acces-en-attente';

/**
 * La première vue de l'Admin que les droits ouvrent, dans l'ordre de la table
 * du rail (Hugo, 2026-10-19). Lue dans le catalogue, pas recopiée : qui ne
 * tient que `staff_access` atterrit sur les Utilisateurs, qui ne tient que
 * `shop_vitrine` sur le webhook — même geste que `firstReglagesView`.
 */
export function firstAdminView(): string {
  const views = inject(WorkspaceCatalogue).views('admin')();
  return views[0]?.link ?? NO_ADMIN_VIEW;
}
