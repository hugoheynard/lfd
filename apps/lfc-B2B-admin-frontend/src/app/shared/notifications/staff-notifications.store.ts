import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import type { StaffNotificationView } from '@lfd/contracts';

import { StaffNotificationsService } from './staff-notifications.service';

/** Rythme de relance du compteur. Une cloche n'est pas du temps réel. */
const POLL_MS = 60_000;

/**
 * L'**état** du fil d'équipe — une seule copie pour toute l'app.
 *
 * Il vit ici, et non dans la cloche, parce que deux écrans le regardent
 * maintenant : la cloche n'en montre que le compte, le panneau la liste. S'ils
 * gardaient chacun le leur, ouvrir le panneau ne ferait pas retomber la
 * pastille — et le compteur mentirait exactement au moment où on le consulte.
 *
 * Le fil est **commun à l'équipe** : marquer lu n'est pas un geste personnel,
 * c'est dire que le fait est traité (cf. {@link StaffNotificationsService}).
 */
@Injectable({ providedIn: 'root' })
export class StaffNotificationsStore {
  private readonly api = inject(StaffNotificationsService);

  private readonly _items = signal<readonly StaffNotificationView[]>([]);
  private readonly _failed = signal(false);

  readonly items = this._items.asReadonly();
  /** Le fil n'a pas pu être relu — dit dans le panneau, jamais en toast. */
  readonly failed = this._failed.asReadonly();

  /**
   * Le compte non lu, **dérivé** de la liste plutôt que reçu à part : un
   * compteur servi séparément diverge dès le premier marquage optimiste.
   */
  readonly unread = computed(() => this._items().filter((item) => item.readAt === null).length);

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async refresh(): Promise<void> {
    try {
      const summary = await this.api.summary();
      this._items.set(summary.notifications);
      this._failed.set(false);
    } catch {
      this._failed.set(true);
    }
  }

  /**
   * Ouvrir une notification vaut traitement. Le marquage est **optimiste** :
   * l'écran ne doit pas attendre l'aller-retour pour s'éteindre, et un échec
   * se rattrape par une relecture plutôt que par un message.
   */
  markRead(id: string): void {
    this.applyRead([id]);
    void this.api.markRead(id).catch(() => this.refresh());
  }

  markAllRead(): void {
    this.applyRead(this._items().map((item) => item.id));
    void this.api.markAllRead().catch(() => this.refresh());
  }

  private applyRead(ids: readonly string[]): void {
    const now = new Date().toISOString();
    const marked = new Set(ids);
    this._items.update((items) =>
      items.map((item) =>
        marked.has(item.id) && item.readAt === null ? { ...item, readAt: now } : item,
      ),
    );
  }
}
