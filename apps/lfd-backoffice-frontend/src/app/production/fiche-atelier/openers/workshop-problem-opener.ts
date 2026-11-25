import { inject, Injectable } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';

import { WORKSHOP_NARROW } from '../rules/workshop-view';

import {
  type ProblemPanelData,
  WorkshopProblemPanel,
} from '../workshop-problem-panel/workshop-problem-panel';
import {
  type StepRedPanelData,
  WorkshopStepRedPanel,
} from '../workshop-step-red-panel/workshop-step-red-panel';

/**
 * **Ouvre le panneau rouge** d'une ligne — ou celui d'une étape — et rend
 * `true` si le serveur a pris le signalement. Le côté se lit au clic, comme
 * le pavé.
 */
@Injectable()
export class WorkshopProblemOpener {
  private readonly panels = inject(FoldPanelHostService);

  async openFor(date: string, line: WorkshopLine): Promise<boolean> {
    const ref = this.panels.open<ProblemPanelData, boolean>(WorkshopProblemPanel, {
      data: { date, line },
      side: side(),
    });
    return (await ref.closed) === true;
  }

  /** Le rouge de l'étape que `workstationId` fait sur la ligne. */
  async openStepRedFor(date: string, line: WorkshopLine, workstationId: string): Promise<boolean> {
    const ref = this.panels.open<StepRedPanelData, boolean>(WorkshopStepRedPanel, {
      data: { date, line, workstationId },
      side: side(),
    });
    return (await ref.closed) === true;
  }
}

function side(): 'bottom' | 'center' {
  const narrow =
    typeof window !== 'undefined' && window.matchMedia?.(WORKSHOP_NARROW).matches === true;
  return narrow ? 'bottom' : 'center';
}
