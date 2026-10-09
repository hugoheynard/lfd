import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FoldEmptyStateComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { NotificationsFeed } from '../notifications-feed.service';

/**
 * **Le contenu du fil de notifications** — bande de tête, « tout marquer comme
 * lu », la liste et son état vide. UN seul gabarit pour les deux formes : le
 * popover de la cloche au bureau, la feuille du bas en pile.
 *
 * ## La non-lue ne se porte pas par la couleur seule
 *
 * Liséré or à gauche **et** graisse du sujet. Un daltonisme, un écran au soleil
 * ou un contraste forcé effacent une teinte ; ils n'effacent ni une barre ni
 * une graisse (SPEC §7).
 */
@Component({
  selector: 'app-notifications-feed-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent],
  templateUrl: './notifications-feed-view.html',
  styleUrl: './notifications-feed-view.scss',
})
export class NotificationsFeedView {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly feed = inject(NotificationsFeed);

  /** Faux dans la feuille du bas, dont `fold-panel-header` tient déjà la tête. */
  readonly withHead = input(true);

  /** « Fermer », dans la bande de tête : c'est l'hôte qui sait comment fermer. */
  readonly closeRequested = output();
}
