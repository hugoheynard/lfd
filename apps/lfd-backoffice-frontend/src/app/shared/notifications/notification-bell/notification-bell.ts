import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { NotificationsPanel } from '../notifications-panel/notifications-panel';
import { StaffNotificationsStore } from '../staff-notifications.store';

/**
 * La **cloche** de l'en-tête : un compteur, et rien de plus.
 *
 * Elle ne détient pas le fil — il vit dans {@link StaffNotificationsStore}, que
 * le panneau lit aussi. Ce partage est ce qui garantit qu'un fait marqué traité
 * éteint la pastille au même instant, sans qu'aucun des deux n'ait à prévenir
 * l'autre.
 */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
})
export class NotificationBell {
  private readonly store = inject(StaffNotificationsStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly unread = this.store.unread;

  /**
   * Le nom accessible **porte le compte** : la pastille est `aria-hidden`
   * (décorative), donc sans ça un lecteur d'écran annoncerait « Notifications »
   * à l'identique qu'il y en ait zéro ou douze.
   */
  protected readonly triggerLabel = computed(() =>
    this.unread() === 0 ? 'Notifications' : `Notifications — ${this.unread()} non lues`,
  );

  /**
   * On relit **avant** d'ouvrir : le panneau ne doit pas montrer plus vieux que
   * la pastille qui vient de le faire cliquer. L'appel n'est pas attendu — la
   * liste connue s'affiche tout de suite et se corrige si besoin.
   */
  protected openPanel(): void {
    void this.store.refresh();
    // Côté (latéral / bottom-sheet) hérité de `NotificationsPanel.foldPanel`.
    this.panels.open(NotificationsPanel);
  }
}
