import { inject } from '@angular/core';
import type { GlobalVersionSubject, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { VersionWatcher } from './version-watcher';

/**
 * Le droit qui ouvre chaque sujet global (`plan-veilleur-unique.md`, § 3.3) :
 * un écran ne demande pas un numéro que le serveur ne lui rendrait pas.
 */
const SUBJECT_PERMISSION: Readonly<Record<GlobalVersionSubject, StaffPermission>> = {
  companies: 'b2b_companies:read',
  'orders-all': 'b2b_orders:read',
  'catalog-admin': 'lfc_catalog:read',
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
    subjects: () => subjects.filter((subject) => permissions.can(SUBJECT_PERMISSION[subject])),
    reload,
    ...(held === undefined ? {} : { held }),
  });
}
