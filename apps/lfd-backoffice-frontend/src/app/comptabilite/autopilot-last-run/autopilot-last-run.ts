import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CollectionAutopilotRunView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { autopilotRunSentence } from '../autopilot-run-wording';

/**
 * **La dernière tentative de la préparation automatique** (PA3) : quand,
 * pour quel lot, avec quelle issue — et le refus du serveur tel quel.
 *
 * Partagée par la fiche de l'entité et l'écran « Prélèvement du mois » :
 * deux encadrés recopiés finiraient par ne plus dire la même chose. Rien
 * quand l'automatisme n'a jamais tenté.
 */
@Component({
  selector: 'app-autopilot-last-run',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './autopilot-last-run.html',
})
export class AutopilotLastRun {
  readonly run = input.required<CollectionAutopilotRunView | null>();

  protected readonly sentence = computed(() => {
    const run = this.run();
    return run === null ? null : autopilotRunSentence(run);
  });
}
