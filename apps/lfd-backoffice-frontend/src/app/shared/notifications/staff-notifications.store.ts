import { computed, inject, Injectable, signal } from '@angular/core';

import type { StaffNotificationView } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { refreshWhileVisible } from '../periodic-refresh';
import { MyStaffNotificationsService } from './my-staff-notifications.service';
import { StaffNotificationsService } from './staff-notifications.service';

/** Rythme de relance du compteur. Une cloche n'est pas du temps réel. */
const POLL_MS = 60_000;

/**
 * L'**état** de la cloche — une seule copie pour toute l'app.
 *
 * Il vit ici, et non dans la cloche, parce que deux écrans le regardent
 * maintenant : la cloche n'en montre que le compte, le panneau la liste. S'ils
 * gardaient chacun le leur, ouvrir le panneau ne ferait pas retomber la
 * pastille — et le compteur mentirait exactement au moment où on le consulte.
 *
 * **Deux fils, une liste** (`plan-a-la-porte.md`, B5, 2026-10-01) :
 * - « mes notifications », adressées à un droit que je tiens — lues par TOUT
 *   staff connecté, le serveur filtre ;
 * - le fil PARTAGÉ de l'équipe, lu SEULEMENT avec `staff_notifications:read` :
 *   sans lui, l'appel prendrait 403 toutes les minutes.
 *
 * Chaque notice se marque lue dans SON fil : le serveur ne connaît pas une
 * notice d'audience par la route du fil partagé, et inversement. Dans les
 * deux, la lecture est commune — marquer lu dit que le fait est traité.
 */
@Injectable({ providedIn: 'root' })
export class StaffNotificationsStore {
  private readonly shared = inject(StaffNotificationsService);
  private readonly mine = inject(MyStaffNotificationsService);
  private readonly permissions = inject(PermissionsStore);

  private readonly _shared = signal<readonly StaffNotificationView[]>([]);
  private readonly _mine = signal<readonly StaffNotificationView[]>([]);
  private readonly _failed = signal(false);

  /** Les deux fils, du plus récent au plus ancien. */
  readonly items = computed(() =>
    [...this._mine(), ...this._shared()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  );
  /** Le fil n'a pas pu être relu — dit dans le panneau, jamais en toast. */
  readonly failed = this._failed.asReadonly();

  /**
   * Le compte non lu, **dérivé** de la liste plutôt que reçu à part : un
   * compteur servi séparément diverge dès le premier marquage optimiste.
   */
  readonly unread = computed(() => this.items().filter((item) => item.readAt === null).length);

  constructor() {
    void this.refresh();
    // 🔴 Onglet visible seulement, et tout de suite au retour (2026-09-28) : la
    // cloche relisait toutes les 60 s même onglet caché — un back-office
    // oublié derrière une autre fenêtre interrogeait la base toute la nuit.
    refreshWhileVisible(() => this.refresh(), POLL_MS);
  }

  async refresh(): Promise<void> {
    try {
      await this.permissions.ensureLoaded();
      const readsShared = this.readsShared();
      const [mine, shared] = await Promise.all([
        this.mine.summary(),
        readsShared ? this.shared.summary() : null,
      ]);
      this._mine.set(mine.notifications);
      this._shared.set(shared?.notifications ?? []);
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
    const isMine = this._mine().some((item) => item.id === id);
    this.applyRead([id]);
    const sent = isMine ? this.mine.markRead(id) : this.shared.markRead(id);
    void sent.catch(() => this.refresh());
  }

  markAllRead(): void {
    this.applyRead(this.items().map((item) => item.id));
    void this.mine.markAllRead().catch(() => this.refresh());
    if (this.readsShared()) {
      void this.shared.markAllRead().catch(() => this.refresh());
    }
  }

  private readsShared(): boolean {
    return this.permissions.can('staff_notifications:read');
  }

  private applyRead(ids: readonly string[]): void {
    const now = new Date().toISOString();
    const marked = new Set(ids);
    const read = (items: readonly StaffNotificationView[]): readonly StaffNotificationView[] =>
      items.map((item) =>
        marked.has(item.id) && item.readAt === null ? { ...item, readAt: now } : item,
      );
    this._mine.update(read);
    this._shared.update(read);
  }
}
