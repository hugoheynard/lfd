import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldIconComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import type { StaffNotificationView } from '@lfd/contracts';

import { StaffNotificationsService } from '../staff-notifications.service';

/** Rythme de relance du compteur. Une cloche n'est pas du temps réel. */
const POLL_MS = 60_000;

/**
 * La **cloche** de l'en-tête : un compteur, et un panneau qui rappelle ce qui
 * vient d'arriver.
 *
 * Elle **annonce, elle n'explique pas**. Chaque ligne est un lien vers l'écran
 * qui porte le détail — rejouer l'alerte ici obligerait à maintenir deux
 * rendus du même fait, et le second finirait par mentir.
 *
 * Un échec de relance ne parle pas : un toast toutes les soixante secondes
 * parce que le réseau est tombé serait pire que le silence. Le panneau, lui, le
 * dit — c'est là qu'on va quand on se demande pourquoi rien n'arrive.
 */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldIconComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
})
export class NotificationBell {
  private readonly api = inject(StaffNotificationsService);

  protected readonly open = signal(false);
  protected readonly items = signal<readonly StaffNotificationView[]>([]);
  protected readonly unread = signal(0);
  protected readonly failed = signal(false);

  /**
   * Le nom accessible de la cloche **porte le compte** : la pastille est
   * `aria-hidden` (décorative), donc sans ça un lecteur d'écran annoncerait
   * « Notifications » à l'identique qu'il y en ait zéro ou douze.
   */
  protected readonly triggerLabel = computed(() =>
    this.unread() === 0 ? 'Notifications' : `Notifications — ${this.unread()} non lues`,
  );

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Ouverture : on rafraîchit d'abord — le panneau ne doit pas montrer plus vieux que le compteur. */
  protected toggled(open: boolean): void {
    this.open.set(open);
    if (open) {
      void this.refresh();
    }
  }

  /**
   * Ouvrir une notification vaut traitement : on la marque lue et on ferme. La
   * navigation appartient au `routerLink` du lien — pas à un `navigate()` ici,
   * qui casserait le clic-milieu et l'ouverture en nouvel onglet.
   */
  protected follow(notification: StaffNotificationView): void {
    this.open.set(false);
    if (notification.readAt !== null) {
      return;
    }
    this.applyRead([notification.id]);
    void this.api.markRead(notification.id).catch(() => this.refresh());
  }

  protected async markAllRead(): Promise<void> {
    this.applyRead(this.items().map((item) => item.id));
    try {
      await this.api.markAllRead();
    } catch {
      await this.refresh();
    }
  }

  protected async refresh(): Promise<void> {
    try {
      const summary = await this.api.summary();
      this.items.set(summary.notifications);
      this.unread.set(summary.unread);
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
  }

  /** Marquage optimiste : l'écran ne doit pas attendre l'aller-retour pour s'éteindre. */
  private applyRead(ids: readonly string[]): void {
    const now = new Date().toISOString();
    const marked = new Set(ids);
    this.items.update((items) =>
      items.map((item) =>
        marked.has(item.id) && item.readAt === null ? { ...item, readAt: now } : item,
      ),
    );
    this.unread.set(this.items().filter((item) => item.readAt === null).length);
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
