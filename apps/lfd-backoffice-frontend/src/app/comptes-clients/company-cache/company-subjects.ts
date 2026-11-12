import { inject } from '@angular/core';
import type { GlobalVersionSubject } from '@lfd/contracts';

import { watchGlobalSubjects } from '../../shared/version/watch-global-subjects';
import { CompanyWrites } from './company-writes';

/**
 * Branche un écran des comptes clients sur le veilleur ({@link watchGlobalSubjects}).
 *
 * Quand un numéro bouge, les copies des sociétés et de la fiche sont
 * déclarées périmées ({@link CompanyWrites.changedElsewhere}) AVANT la
 * relecture de l'écran : sans cela, elle resservirait la copie.
 *
 * ⚠️ Dans un contexte d'injection : l'arrêt suit l'écran.
 */
export function watchCompanySubjects(
  subjects: readonly GlobalVersionSubject[],
  reload: () => Promise<void>,
): void {
  const writes = inject(CompanyWrites);
  watchGlobalSubjects(subjects, () => {
    writes.changedElsewhere();
    return reload();
  });
}
