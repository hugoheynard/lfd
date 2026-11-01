import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ProductionWorksheetView } from '@lfd/contracts';
import { FoldEmptyStateComponent } from 'fold-ng';

import { tranchesNow } from '../../production/previsionnel/day-tranches-section/day-tranches-section';
import { WorkshopClock } from '../../production/fiche-atelier/workshop-clock';
import { WorksheetSlots } from '../../production/fiche-atelier/worksheet-slots/worksheet-slots';
import { parisToday } from '../../shared/paris-today';

/** Les deux lectures de la colonne 1 (Hugo, 2026-11-01). */
export type PreparationView = 'shelves' | 'slots';

/**
 * **La colonne Préparation, par tranche** — la vue de la fiche d'atelier et du
 * Prod manager (`app-worksheet-slots`), en lecture seule : Dépassée, La
 * prochaine, À venir, Tenue, et la jauge sorti / à sortir. Aucun geste : la
 * Supervision regarde, l'atelier agit.
 *
 * Les lignes sont celles que la colonne lit déjà (`admin/supervision/preparation`,
 * même contrat que la fiche) : pas de seconde lecture, ni d'autre droit.
 */
@Component({
  selector: 'app-preparation-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, WorksheetSlots],
  providers: [WorkshopClock],
  templateUrl: './preparation-slots.html',
})
export class PreparationSlots {
  private readonly clock = inject(WorkshopClock);

  readonly view = input.required<ProductionWorksheetView>();
  /** La journée supervisée, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();
  /** Colonne étroite : un seul bouton par rangée, comme la fiche au téléphone. */
  readonly narrow = input(false);

  protected readonly lines = computed(() => this.view().groups.flatMap((group) => group.lines));

  protected readonly now = computed(() =>
    tranchesNow(this.date(), parisToday(), this.clock.minutes()),
  );
}
