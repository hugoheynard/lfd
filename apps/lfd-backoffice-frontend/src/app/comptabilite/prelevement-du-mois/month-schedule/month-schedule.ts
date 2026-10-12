import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LegalEntityView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { AutopilotLastRun } from '../../autopilot-last-run/autopilot-last-run';
import { CollectionCalendar } from '../../collection-calendar/collection-calendar';

/**
 * **Le calendrier de la prochaine clôture**, en tête de l'écran : la frise datée par le
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

  /**
   * « du mois » : depuis M1 (plan `plan-rythme-de-facturation.md`, §16), le
   * lot suit le MODE MENSUEL de l'entité. « de la prochaine clôture » reviendra
   * avec le calendrier d'union (M3/M4).
   */
  protected readonly title = 'Le calendrier du mois';
}
