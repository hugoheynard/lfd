import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { AutopilotLastRun } from '../../autopilot-last-run/autopilot-last-run';
import { CollectionCalendar } from '../../collection-calendar/collection-calendar';

/**
 * **Le calendrier du mois**, en tête de l'écran : la frise datée par le
 * serveur, l'état de la préparation automatique et sa dernière tentative
 * (PA3), et le chemin vers la fiche de l'entité où ces dates se règlent.
 *
 * La dernière tentative s'affiche même désactivée : ce qu'elle a fait reste
 * vrai, et un échec rangé doit se lire.
 */
@Component({
  selector: 'app-month-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AutopilotLastRun,
    CollectionCalendar,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    RouterLink,
  ],
  templateUrl: './month-schedule.html',
  styleUrl: './month-schedule.scss',
})
export class MonthSchedule {
  readonly entity = input.required<LegalEntityView>();
}
