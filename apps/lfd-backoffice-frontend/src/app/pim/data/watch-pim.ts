import { inject } from '@angular/core';
import type { StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { VersionWatcher } from '../../shared/version/version-watcher';

/**
 * Branche un store du référentiel sur le numéro `pim`
 * (`documentation/caching-usage/plan-lectures-du-pim.md`, § 4.3 et § 4.4) :
 * quand le numéro diffère, le store se relit en fond.
 *
 * Le sujet ne se suit que si la personne a le droit de la ROUTE que lit le
 * store, pas seulement l'un des droits qui ouvrent `pim` : un store dont la
 * route lui est fermée (la TVA sans `pim_tax`) ne serait relu que pour
 * essuyer un refus. Celui-là garde sa relecture à l'ouverture.
 *
 * ⚠️ Dans un contexte d'injection (le constructeur du store).
 */
export function watchPim(permission: StaffPermission, refresh: () => Promise<void>): void {
  const permissions = inject(PermissionsStore);
  inject(VersionWatcher).watch({
    subjects: () => (permissions.can(permission) ? ['pim'] : []),
    reload: refresh,
  });
}
