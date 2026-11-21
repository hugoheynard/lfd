import { inject, Injectable } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';

import { WORKSHOP_NARROW } from '../rules/workshop-view';

import {
  type ProblemPanelData,
  WorkshopProblemPanel,
} from '../workshop-problem-panel/workshop-problem-panel';

/**
 * **Ouvre le panneau rouge** d'une ligne et rend `true` si le serveur a pris
 * le signalement. Le côté se lit au clic, comme le pavé.
 */
@Injectable()
export class WorkshopProblemOpener {
  private readonly panels = inject(FoldPanelHostService);

  async openFor(date: string, line: WorkshopLine): Promise<boolean> {
    const narrow =
      typeof window !== 'undefined' && window.matchMedia?.(WORKSHOP_NARROW).matches === true;
    const ref = this.panels.open<ProblemPanelData, boolean>(WorkshopProblemPanel, {
      data: { date, line },
      side: narrow ? 'bottom' : 'center',
    });
    return (await ref.closed) === true;
  }
}
