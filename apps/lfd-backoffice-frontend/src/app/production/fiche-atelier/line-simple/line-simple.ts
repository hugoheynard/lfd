import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { LineProblemNote } from '../line-problem-note/line-problem-note';

/**
 * **Une ligne « simple »** (`documentation/fournil/les-niveaux-de-suivi.md`) : ✅ « Fait » ou 🟥 « Problème », par produit.
 *
 * « Fait » n'envoie aucune quantité : le serveur déclare le reste sous le
 * plafond (`remainingUnderCeiling`). Il est désarmé quand ce reste est nul —
 * la ligne est faite, ou le plafond d'un rouge est atteint.
 */
@Component({
  selector: 'app-line-simple',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, LineProblemNote],
  templateUrl: './line-simple.html',
  styleUrl: './line-simple.scss',
  host: {
    '[class.is-done]': 'line().done',
    '[class.is-problem]': '(line().problem ?? null) !== null',
  },
})
export class LineSimple {
  readonly line = input.required<WorkshopLine>();
  /** Un geste de cette ligne est en vol. */
  readonly busy = input(false);

  readonly done = output<void>();
  readonly problem = output<void>();

  /** Ce que « Fait » déclarerait, tel que servi ; `remaining` faute du champ. */
  protected readonly left = computed(() => {
    const line = this.line();
    return line.remainingUnderCeiling ?? line.remaining;
  });

  protected readonly figures = computed(() => {
    const line = this.line();
    return `${this.figure(line.produced)} / ${this.figure(line.quantity)} sorties`;
  });

  /** « Fait · 120 » : le geste dit ce qu'il déclare. */
  protected readonly doneLabel = computed(() => `Fait · ${this.figure(this.left())}`);

  private figure(quantity: number): string {
    return saleQuantityLabel(quantity, this.line().saleUnit);
  }
}
