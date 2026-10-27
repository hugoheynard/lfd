import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { UsualSuggestionView } from '@lfd/contracts';

import { ClientCopyService } from '../../copy/client-copy.service';
import { UsualGroupCard, type UsualGroup } from '../usual-group-card/usual-group-card';
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
  imports: [UsualGroupCard],
  providers: [UsualPicks],
  templateUrl: './usual-picks.html',
  styleUrl: './usual-picks.scss',
})
export class UsualPicksRow {
  protected readonly picks = inject(UsualPicks);
  protected readonly t = inject(ClientCopyService).t;

  /**
   * Une carte par rythme (Hugo, 2026-10-27) : un jour de la semaine réunit
   * ses articles, les habituels sans jour se réunissent en « Souvent
   * commandés ». L'ordre du serveur est gardé, dans et entre les cartes.
   */
  protected readonly groups = computed<readonly UsualGroup[]>(() => {
    const shop = this.t().shop;
    const byKey = new Map<string, { title: string; views: UsualSuggestionView[] }>();
    for (const view of this.picks.current()) {
      const reason = view.reason;
      const [key, title] =
        reason.kind === 'weekly_rhythm'
          ? [`day:${reason.weekday}`, shop.usualEvery[reason.weekday]]
          : ['often', shop.usualOften];
      const group = byKey.get(key) ?? { title, views: [] };
      group.views.push(view);
      byKey.set(key, group);
    }
    return [...byKey].map(([key, group]) => ({ key, ...group }));
  });
}
