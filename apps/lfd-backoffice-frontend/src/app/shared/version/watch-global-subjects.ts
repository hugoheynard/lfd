import { inject } from '@angular/core';
import type { GlobalVersionSubject, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { VersionWatcher } from './version-watcher';

/**
 * Les droits qui ouvrent chaque sujet global (`plan-veilleur-unique.md`,
 * § 3.3) — l'un suffit, comme au serveur : un écran ne demande pas un numéro
 * que le serveur ne lui rendrait pas. `pim` s'ouvre à qui lit une part du
 * référentiel (`plan-lectures-du-pim.md`, § 4.4).
 */
const SUBJECT_PERMISSIONS: Readonly<
  Record<GlobalVersionSubject, readonly [StaffPermission, ...StaffPermission[]]>
> = {
  companies: ['b2b_companies:read'],
  'orders-all': ['b2b_orders:read'],
  'catalog-admin': ['lfc_catalog:read'],
  pim: ['pim_catalog:read', 'pim_tax:read', 'pim_settings:read', 'allergen_matrix:read'],
};

/**
 * Branche un écran sur des sujets globaux, filtrés par les droits du poste
 * et relus à chaque tour (les droits arrivent après le premier rendu).
 *
 * ⚠️ Dans un contexte d'injection : l'arrêt suit l'écran.
 */
export function watchGlobalSubjects(
  subjects: readonly GlobalVersionSubject[],
  reload: () => Promise<void>,
  held?: (subject: GlobalVersionSubject) => number | null,
): void {
  const permissions = inject(PermissionsStore);
  inject(VersionWatcher).watch({
    subjects: () =>
      subjects.filter((subject) =>
        SUBJECT_PERMISSIONS[subject].some((permission) => permissions.can(permission)),
      ),
    reload,
    ...(held === undefined ? {} : { held }),
  });
}
