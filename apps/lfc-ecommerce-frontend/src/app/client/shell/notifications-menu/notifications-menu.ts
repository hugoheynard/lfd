import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldIconComponent,
  FoldPanelHostService,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { BarSheet } from '../bar-sheet.service';
import { NotificationsFeedView } from '../notifications-feed-view/notifications-feed-view';
import { NotificationsFeed } from '../notifications-feed.service';
import { NotificationsSheet } from '../notifications-sheet/notifications-sheet';

/**
 * **La cloche**, sous ses deux formes : un popover au bureau — même grammaire
 * que le menu d'espaces et que le panier (`_popover.scss`) —, une feuille du
 * bas en pile (Hugo, 2026-10-09). Le contenu est le même composant
 * ({@link NotificationsFeedView}), et l'état « lu » vit dans
 * {@link NotificationsFeed} pour que les deux formes s'accordent.
 *
 * ## 🔴 Ce qu'il montre est une MAQUETTE
 *
 * Les lignes viennent de `notifications.fixture.ts`, qui dit en toutes lettres
 * qu'elles sont inventées, pourquoi, et quel est le seul point à rebrancher.
 *
 * ## Qui la porte
 *
 * Le shell la monte quand l'écran en demande une ET qu'il y a quelqu'un à
 * notifier : ce qui se notifie appartient à un compte.
 */
@Component({
  selector: 'app-notifications-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldIconComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    NgTemplateOutlet,
    NotificationsFeedView,
  ],
  templateUrl: './notifications-menu.html',
  styleUrl: './notifications-menu.scss',
})
export class NotificationsMenu {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly feed = inject(NotificationsFeed);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly open = signal(false);

  /** La feuille de barre ouverte, partagée avec le panier : une seule à la fois. */
  private readonly sheets = inject(BarSheet);
  protected readonly sheetOpen = computed(() => this.sheets.openKey() === 'notifications');

  /** Le compte fait partie du NOM du bouton : sans lui, la pastille est muette. */
  protected readonly bellLabel = computed(() => {
    const label = this.t().chrome.notifications;
    const count = this.feed.unread();
    return count > 0 ? `${label} — ${count}` : label;
  });

  protected close(): void {
    this.open.set(false);
  }

  /** Un second clic referme ; ouvrir ferme le panier s'il l'était. */
  protected toggleSheet(): void {
    void this.sheets.toggle('notifications', () => NotificationsSheet.open(this.panels));
  }
}
