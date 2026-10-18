import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../../copy/client-copy.service';
import { StaffSuggestionCard } from '../staff-suggestion-card/staff-suggestion-card';
import { UsualPicks } from '../usual-picks.service';

/**
 * **« Vos habituels »** — la rangée d'un PRO à l'accueil (R1), au-dessus de
 * « Notre sélection » : la carte partagée, une par article (huit au plus),
 * chacune titrée de sa raison (« Tous les mardis », « Commandé 6 fois »). Un
 * clic ouvre la fiche, le « + » ajoute. Sans habituel — ou sans société —,
 * rien : ni rangée, ni titre.
 */
@Component({
  selector: 'app-usual-picks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StaffSuggestionCard],
  providers: [UsualPicks],
  templateUrl: './usual-picks.html',
  styleUrl: './usual-picks.scss',
})
export class UsualPicksRow {
  protected readonly picks = inject(UsualPicks);
  protected readonly t = inject(ClientCopyService).t;
}
