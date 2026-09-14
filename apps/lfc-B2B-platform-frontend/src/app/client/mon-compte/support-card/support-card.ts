import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCardComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { panelSide } from '../../panel-side';
import { supportChannels } from '../../support-channels';
import { SupportPanel } from '../support-panel/support-panel';

/**
 * « Contacter le service commercial » — sous les cartes de `/mon-compte`, une
 * carte bleu clair qui ouvre le panneau des coordonnées.
 *
 * La carte entière est le geste, et c'est pourquoi elle est `interactive` : elle
 * ne contient ni lien ni autre bouton, et le rôle `button` que fold lui pose
 * dit exactement ce qu'elle fait. Les coordonnées vivent dans le panneau — la
 * carte reste courte, amarrée au bas de l'écran en pile.
 *
 * Sans aucun canal publié, la carte se tait plutôt que d'ouvrir un panneau vide.
 */
@Component({
  selector: 'app-support-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldIconComponent],
  templateUrl: './support-card.html',
  styleUrl: './support-card.scss',
})
export class SupportCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly identity = inject(ClientContent).identity;
  private readonly panels = inject(FoldPanelHostService);

  protected readonly reachable = computed(() => {
    const { phone, email } = supportChannels(this.identity());
    return phone !== null || email !== null;
  });

  protected open(): void {
    // Solide : des coordonnées se lisent sur un fond qui ne laisse pas passer la page.
    this.panels.open(SupportPanel, { side: panelSide(), surface: 'solid' });
  }
}
