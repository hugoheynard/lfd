import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LegalEntityView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { CollectionCalendar } from '../../collection-calendar/collection-calendar';

/**
 * **Le calendrier du mois**, en tête de l'écran : la frise datée par le
 * serveur, l'état de la préparation automatique, et le chemin vers la fiche
 * de l'entité où ces dates se règlent.
 *
 * ## « Pas encore branchée » est dit, pas tu
 *
 * La préparation automatique (PA3) n'existe pas côté serveur : ni cron, ni
 * table de tentatives dans `apps/lfd-api` (vérifié le 2026-10-08). Activée,
 * elle n'a donc aucune « dernière tentative » à montrer, et la carte le dit
 * plutôt que de laisser attendre un lot qui ne viendra pas tout seul.
 * Retirer l'encadré quand PA3 est bâti.
 */
@Component({
  selector: 'app-month-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CollectionCalendar,
    FoldButtonComponent,
    FoldCalloutComponent,
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
