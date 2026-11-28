import { inject } from '@angular/core';
import type { RedirectFunction } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import type { FoldViewNavItem } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { ResupplySwitchStore } from '../../shared/resupply-switch/resupply-switch.store';

/** Un onglet de Prod manager, et le droit de sa route. */
export interface ProdManagerView extends FoldViewNavItem {
  readonly link: string;
  /** Un seul de ces droits suffit. */
  readonly needsAnyOf: readonly StaffPermission[];
  /** L'onglet n'existe que réassort allumé (Réglages › Production › Fournil). */
  readonly requiresResupply?: true;
}

/**
 * Les onglets de **Prod manager** (lot R3d,
 * `reassort-boutiques/README.md`, Hugo 2026-10-21) — sur
 * le modèle du comptoir : un espace à routes enfants, chacune gardée par son
 * droit. « Réassorts » garde celui de l'ancienne entrée « Réassorts à
 * produire » : la fournée OU le prévisionnel.
 */
export const PROD_MANAGER_VIEWS: readonly ProdManagerView[] = [
  {
    key: 'previsionnel',
    label: 'Prévisionnel',
    link: '/prod-manager/previsionnel',
    icon: 'calendar',
    needsAnyOf: ['production_plan:read'],
  },
  {
    key: 'reassorts',
    label: 'Réassorts',
    link: '/prod-manager/reassorts',
    icon: 'store',
    // Un droit à part (Hugo, 2026-10-28) : ni la fiche d'atelier ni le
    // prévisionnel ne l'ouvrent.
    needsAnyOf: ['production_resupply:read'],
    requiresResupply: true,
  },
];

/**
 * Les onglets que ces droits ouvrent, dans l'ordre — sans « Réassorts » quand
 * l'interrupteur est éteint.
 */
export function permittedProdManagerViews(
  can: (permission: StaffPermission) => boolean,
  resupplyEnabled = true,
): readonly ProdManagerView[] {
  return PROD_MANAGER_VIEWS.filter(
    (view) => view.needsAnyOf.some(can) && (view.requiresResupply !== true || resupplyEnabled),
  );
}

/** Le repli quand aucun onglet n'est permis : son garde redirige ailleurs. */
const FALLBACK = '/prod-manager/previsionnel';

/**
 * `/prod-manager` ouvre le **premier onglet permis**, comme le comptoir : une
 * redirection fixe vers le prévisionnel renverrait, par son garde, la seule
 * fournée hors de l'espace. Attend les droits (premier chargement).
 */
export const prodManagerLanding: RedirectFunction = async () => {
  const permissions = inject(PermissionsStore);
  const resupply = inject(ResupplySwitchStore);
  await Promise.all([permissions.ensureLoaded(), resupply.ensureLoaded()]);
  return (
    permittedProdManagerViews((permission) => permissions.can(permission), resupply.enabled())[0]
      ?.link ?? FALLBACK
  );
};
