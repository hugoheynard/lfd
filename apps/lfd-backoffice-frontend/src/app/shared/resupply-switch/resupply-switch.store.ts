import { computed, inject, Injectable, signal } from '@angular/core';
import type { ResupplySwitchView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { ResupplySwitchService } from './resupply-switch.service';

/** Les droits sous lesquels le serveur sert l'interrupteur : un seul suffit. */
const READ_RIGHTS: readonly StaffPermission[] = [
  'production_settings:read',
  'production_resupply:read',
  'handover_counter:read',
  'resupply_templates:read',
];

/**
 * **L'interrupteur du réassort**, lu une fois pour tout le back-office : le
 * comptoir, le Prod manager et leurs gardes de route s'y règlent.
 *
 * **Éteint par défaut** : tant que la lecture n'a pas répondu, qu'elle a
 * échoué ou que le poste ne tient aucun droit qui la sert, `enabled` vaut
 * `false` — un écran de réassort montré à tort promettrait des envois que le
 * serveur refuse. Une lecture échouée se retente au prochain `ensureLoaded()`.
 */
@Injectable({ providedIn: 'root' })
export class ResupplySwitchStore {
  private readonly api = inject(ResupplySwitchService);
  private readonly permissions = inject(PermissionsStore);

  private readonly current = signal<ResupplySwitchView | null>(null);
  private readonly failed = signal(false);
  private loaded = false;
  private pending: Promise<void> | null = null;

  /** La vue servie ; `null` tant qu'elle n'est pas lue. */
  readonly view = this.current.asReadonly();
  readonly enabled = computed(() => this.current()?.enabled ?? false);
  /** La dernière lecture a échoué : l'interrupteur se montre éteint, et l'écran le dit. */
  readonly loadFailed = this.failed.asReadonly();

  /** Lit une fois. Les appels concurrents partagent la même lecture. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.pending ??= this.load();
    await this.pending;
  }

  /** Pose l'interrupteur, puis relit. Un refus remonte tel quel. */
  async set(enabled: boolean): Promise<void> {
    await this.api.set({ enabled });
    this.pending = this.load();
    await this.pending;
  }

  private async load(): Promise<void> {
    try {
      await this.permissions.ensureLoaded();
      if (!READ_RIGHTS.some((permission) => this.permissions.can(permission))) {
        this.current.set(null);
        return;
      }
      this.current.set(await this.api.read());
      this.failed.set(false);
      this.loaded = true;
    } catch {
      // Éteint, et relu au prochain appel : un hoquet ne fige pas l'écran.
      this.current.set(null);
      this.failed.set(true);
    } finally {
      this.pending = null;
    }
  }
}
