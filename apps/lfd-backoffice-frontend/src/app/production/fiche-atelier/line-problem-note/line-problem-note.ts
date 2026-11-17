import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { hourLabel } from '../../worksheet-day';

/**
 * **Le rouge d'une ligne, tel que servi** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : le problème
 * ouvert — sorti déclaré, raison, heure — puis le plafond, qui survit au
 * « traité ». Rien n'est calculé : tout vient de la ligne.
 */
@Component({
  selector: 'app-line-problem-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './line-problem-note.html',
})
export class LineProblemNote {
  readonly line = input.required<WorkshopLine>();

  /** « Signalé à 9 h 12 : 80 sorties sur 120 attendues · four en panne » ; `null` sans rouge ouvert. */
  protected readonly problem = computed(() => {
    const problem = this.line().problem ?? null;
    if (problem === null) {
      return null;
    }
    const at = hourLabel(problem.reportedAt);
    const said = `Problème signalé${at === null ? '' : ` à ${at}`} : ${this.figure(problem.produced)} sorties sur ${this.figure(problem.expected)} attendues`;
    return problem.reason === null ? said : `${said} · ${problem.reason}`;
  });

  /** « Plafond du jour : 80 » ; `null` si la ligne n'a jamais eu de rouge. */
  protected readonly ceiling = computed(() => {
    const ceiling = this.line().ceiling ?? null;
    return ceiling === null ? null : `Plafond du jour : ${this.figure(ceiling)}`;
  });

  private figure(quantity: number): string {
    return saleQuantityLabel(quantity, this.line().saleUnit);
  }
}
