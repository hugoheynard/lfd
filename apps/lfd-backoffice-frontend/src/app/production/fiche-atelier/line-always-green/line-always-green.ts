import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent, type FoldBadgeVariant } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { LineProblemNote } from '../line-problem-note/line-problem-note';
import { beforeLabel, steps } from '../workshop-deadlines';

/** Un palier de la ligne, dit en une pastille. */
interface StepBadge {
  readonly key: number;
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/**
 * **Une ligne « toujours vert »** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 1, § 3.10) : rien à
 * cocher. Chaque palier est réputé sorti à son heure plus la marge, par le
 * serveur ; la ligne montre l'avancement palier par palier, tel que les
 * fournées le disent, et offre un seul geste : 🟥 « Problème ».
 */
@Component({
  selector: 'app-line-always-green',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, LineProblemNote],
  templateUrl: './line-always-green.html',
  styleUrl: './line-always-green.scss',
  host: { '[class.is-problem]': '(line().problem ?? null) !== null' },
})
export class LineAlwaysGreen {
  readonly line = input.required<WorkshopLine>();
  /** Un geste de cette ligne est en vol. */
  readonly busy = input(false);

  /** « Problème » : le parent ouvre le panneau rouge. */
  readonly problem = output<void>();

  /** « 120 / 240 sorties » — ce que les fournées disent, corrigé déduit. */
  protected readonly figures = computed(() => {
    const line = this.line();
    return `${this.figure(line.produced)} / ${this.figure(line.quantity)} sorties`;
  });

  /** Les paliers : tenu (vert) ou pas encore (neutre), dans l'ordre des heures. */
  protected readonly steps = computed<readonly StepBadge[]>(() => {
    const produced = this.line().produced;
    return steps(this.line()).map((step) => {
      const met = produced >= step.to;
      return {
        key: step.to,
        label: `${met ? '✓ ' : ''}${this.figure(step.q)} ${beforeLabel(step.before)}`,
        variant: met ? 'success' : 'neutral',
      };
    });
  });

  private figure(quantity: number): string {
    return saleQuantityLabel(quantity, this.line().saleUnit);
  }
}
