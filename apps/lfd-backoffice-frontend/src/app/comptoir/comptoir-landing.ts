import { inject } from '@angular/core';
import type { RedirectFunction } from '@angular/router';

import { PermissionsStore } from '../auth/permissions.store';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/** Le repli quand aucun onglet n'est permis : son garde redirige ailleurs. */
const FALLBACK = '/comptoir/retrait';
/** Le relais vers la page à part de la saisie, qui note le comptoir comme origine. */
const ORDER_ENTRY_RELAY = '/comptoir/nouvelle-commande';

/**
 * `/comptoir` ouvre le **premier onglet permis** — celui que la barre montre
 * en tête. Une redirection fixe vers le retrait renvoyait, par son garde, le
 * poste qui ne tient que la commande pro hors du comptoir.
 *
 * Attend les droits : au premier chargement, la redirection court avant que
 * `/admin/me` ait répondu, et la liste serait vide.
 */
export const comptoirLanding: RedirectFunction = async () => {
  const permissions = inject(PermissionsStore);
  const views = inject(WorkspaceCatalogue).views('comptoir');
  await permissions.ensureLoaded();
  // Un poste qui ne tient que la commande n'a aucune vue : il part saisir.
  const canPlace = permissions.can('b2b_counter:read') && permissions.can('b2b_place_order:write');
  return views()[0]?.link ?? (canPlace ? ORDER_ENTRY_RELAY : FALLBACK);
};
