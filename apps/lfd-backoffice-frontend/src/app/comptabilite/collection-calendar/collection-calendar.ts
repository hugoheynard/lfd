import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CollectionCalendarView } from '@lfd/contracts';
import { FoldTimelineComponent } from 'fold-ng';

import { collectionSteps } from '../collection-schedule-wording';

/**
 * **La frise du mois** — clôture, préparation du lot, limite de dépôt,
 * prélèvement — telle que le serveur la date.
 *
 * Partagée par la fiche de l'entité (où elle se règle) et l'écran
 * « Prélèvement du mois » (où elle se lit) : deux frises recopiées finiraient
 * par ne plus dire la même chose. Elle n'affiche que les dates du serveur —
 * la même fonction date le fichier déposé (cf. `collection-schedule-wording.ts`).
 */
@Component({
  selector: 'app-collection-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldTimelineComponent],
  templateUrl: './collection-calendar.html',
})
export class CollectionCalendar {
  readonly calendar = input.required<CollectionCalendarView>();

  protected readonly steps = computed(() => collectionSteps(this.calendar()));
}
