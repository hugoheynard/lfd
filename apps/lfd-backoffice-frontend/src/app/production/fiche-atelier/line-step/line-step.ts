import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent } from 'fold-ng';

import type { WorkshopLine, WorkshopStepState } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Une ligne d'étape** (`fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.2, § 2.9) : ce poste ne finit pas le produit, il en fait une part.
 * La quantité se lit — toute la quantité commandée, que l'étape prépare —
 * mais ne se compte pas : seul le poste qui finit déclare des pièces.
 *
 * Trois gestes : « Étape faite » et le rouge tant que l'étape attend ;
 * « Décocher » une fois faite ou en rouge. L'état se lit sur `stepState`,
 * que le serveur sert pour le poste de la fiche ; sans lui, sur
 * `stepsPending` (qui ne distingue pas un rouge d'une attente).
 */
@Component({
  selector: 'app-line-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './line-step.html',
  styleUrl: './line-step.scss',
  host: { '[class.is-done]': "state() === 'done'", '[class.is-red]': "state() === 'red'" },
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

  protected readonly state = computed((): WorkshopStepState => {
    const line = this.line();
    if (line.stepState !== undefined && line.stepState !== null) {
      return line.stepState;
    }
    return (line.stepsPending ?? []).includes(this.workstationId()) ? 'pending' : 'done';
  });

  /** « Rouge — Four en panne », ou « Rouge » sans raison. */
  protected readonly redLabel = computed(() => {
    const reason = this.line().stepRedReason;
    return reason === undefined || reason === null || reason === '' ? 'Rouge' : `Rouge — ${reason}`;
  });

  /** « 10 à préparer » — toute la quantité, en lecture seule. */
  protected readonly figures = computed(() => {
    const line = this.line();
    return `${saleQuantityLabel(line.quantity, line.saleUnit)} à préparer`;
  });
}
