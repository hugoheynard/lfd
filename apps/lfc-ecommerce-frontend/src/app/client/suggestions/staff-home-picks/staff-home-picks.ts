import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../../copy/client-copy.service';
import { StaffSuggestionCard } from '../staff-suggestion-card/staff-suggestion-card';
import { StaffHomePicks } from '../staff-home-picks.service';

/**
 * **« Notre sélection »** — la rangée des suggestions du staff à l'accueil
 * (RS7) : la carte partagée, une par article (deux au plus), côte à côte au
 * bureau, l'une sous l'autre en pile. Sans règle applicable, rien : ni
 * rangée, ni titre.
 *
 * La phrase du staff tient lieu de titre ; sans phrase, « Notre sélection ».
 */
@Component({
  selector: 'app-staff-home-picks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StaffSuggestionCard],
  providers: [StaffHomePicks],
  templateUrl: './staff-home-picks.html',
  styleUrl: './staff-home-picks.scss',
})
export class StaffHomePicksRow {
  protected readonly picks = inject(StaffHomePicks);
  protected readonly t = inject(ClientCopyService).t;
}
