import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  type FoldPanelHostService,
  type FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { NotificationsFeedView } from '../notifications-feed-view/notifications-feed-view';
import { NotificationsFeed } from '../notifications-feed.service';

/**
 * **Les notifications en feuille du bas** — la forme de la cloche en pile
 * (Hugo, 2026-10-09 : « pareil » que le panier, sur toute la hauteur jusqu'à
 * la barre). Au bureau, la cloche garde son popover.
 *
 * ⚠️ **Non modale** : un voile sur un téléphone bloquait la barre, donc la
 * cloche elle-même — on ne pouvait plus la recliquer pour refermer (Hugo,
 * 2026-10-09). Sans voile, la page reste vivante derrière, et la feuille se
 * ferme par son en-tête, Échap, ou un second clic sur la cloche.
 */
@Component({
  selector: 'app-notifications-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, NotificationsFeedView],
  templateUrl: './notifications-sheet.html',
})
export class NotificationsSheet {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'bottom',
    modal: false,
    surface: 'solid',
  };

  static open(panels: FoldPanelHostService): FoldPanelRef<void> {
    return panels.open<undefined, void>(NotificationsSheet, {
      side: 'bottom',
      modal: false,
      data: undefined,
    });
  }

  /** Exigée par le contrat faible de `FoldPanelContent` — cf. `CartDialog.data`. */
  readonly data = input<undefined>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly feed = inject(NotificationsFeed);
}
