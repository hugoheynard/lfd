import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StaffNotificationView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { StaffNotificationsStore } from '../staff-notifications.store';

/**
 * Le **fil d'équipe**, en panneau : ce qui vient d'arriver, et où aller pour
 * s'en occuper.
 *
 * Il **annonce, il n'explique pas**. Chaque ligne est un lien vers l'écran qui
 * porte le détail — rejouer l'alerte ici obligerait à maintenir deux rendus du
 * même fait, et le second finirait par mentir.
 *
 * Un échec de relecture se dit ici et nulle part ailleurs : un toast toutes les
 * soixante secondes parce que le réseau est tombé serait pire que le silence.
 * Le panneau est précisément l'endroit où l'on va quand on se demande pourquoi
 * rien n'arrive.
 */
@Component({
  selector: 'app-notifications-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldPanelHeaderComponent, FoldButtonComponent],
  templateUrl: './notifications-panel.html',
  styleUrl: './notifications-panel.scss',
})
export class NotificationsPanel {
  /**
   * Nature du panneau : **non-modal** (on continue à lire l'écran derrière) et
   * `side: 'auto'` — tiroir latéral au large, **bottom-sheet** sur étroit. Une
   * liste qu'on parcourt debout, le pouce en bas de l'écran.
   */
  static readonly foldPanel: FoldPanelDefaults = {
    modal: false,
    surface: 'solid',
    side: 'auto',
  };

  private readonly ref = inject(FoldPanelRef);
  protected readonly store = inject(StaffNotificationsStore);

  /** Le compte non lu en sous-titre — ou rien à dire quand tout est traité. */
  protected readonly subtitle = computed(() => {
    const unread = this.store.unread();
    if (unread === 0) {
      return 'Tout est traité';
    }
    return unread === 1 ? '1 non lue' : `${unread} non lues`;
  });

  /**
   * Ouvrir une notification vaut traitement : on la marque lue et on ferme. La
   * navigation appartient au `routerLink` du lien — pas à un `navigate()` ici,
   * qui casserait le clic-milieu et l'ouverture en nouvel onglet.
   */
  protected follow(notification: StaffNotificationView): void {
    this.ref.close();
    if (notification.readAt === null) {
      this.store.markRead(notification.id);
    }
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
