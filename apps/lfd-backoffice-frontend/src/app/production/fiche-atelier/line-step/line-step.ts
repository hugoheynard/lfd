import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent } from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Une ligne d'étape** (`fournil/plan-produit-sur-plusieurs-postes.md`,
 * § 2.7, § 2.9) : ce poste ne finit pas le produit, il en fait une part.
 * La quantité se lit — toute la quantité commandée, que l'étape prépare —
 * mais ne se compte pas : seul le poste qui finit déclare des pièces.
 *
 * Trois gestes : « Étape faite », le rouge, et décocher. L'étape est faite
 * quand ce poste n'est plus dans `stepsPending` ; un rouge y reste, la fiche
 * ne le distingue pas d'une étape qui attend.
 */
@Component({
  selector: 'app-line-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './line-step.html',
  styleUrl: './line-step.scss',
  host: { '[class.is-done]': 'stepDone()' },
})
export class LineStep {
  readonly line = input.required<WorkshopLine>();
  /** Le poste de la fiche ouverte : celui dont c'est l'étape. */
  readonly workstationId = input.required<string>();
  /** Un geste de cette ligne est en vol. */
  readonly busy = input(false);

  readonly done = output<void>();
  readonly red = output<void>();
  readonly undone = output<void>();

  protected readonly stepDone = computed(
    () => !(this.line().stepsPending ?? []).includes(this.workstationId()),
  );

  /** « 10 à préparer » — toute la quantité, en lecture seule. */
  protected readonly figures = computed(() => {
    const line = this.line();
    return `${saleQuantityLabel(line.quantity, line.saleUnit)} à préparer`;
  });
}
