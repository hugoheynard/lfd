import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  ContentLocale,
  ShopCopyAdminView,
  ShopCopyEntryView,
  ShopCopyLocaleView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ShopCopyService } from '../data/shop-copy.service';
import { COPY_LOCALES } from '../rules/copy-text';

/**
 * **Les textes de la boutique, tels que l'écran les tient** — l'écran
 * d'édition lu en entier, Publier, et la retouche locale d'une ligne après une
 * écriture acceptée.
 *
 * Une écriture acceptée ne relit pas tout : le serveur avance la révision
 * d'exactement un (`ShopCopyEntry.touch`, relu le 2026-10-11), et l'écran
 * retouche la ligne en place. Une écriture refusée, elle, relit tout — c'est
 * le seul moyen de connaître la version de l'autre.
 *
 * Fourni par la page : son état ne survit pas à l'écran.
 */
@Injectable()
export class ShopCopyStore {
  private readonly api = inject(ShopCopyService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  private readonly view = signal<ShopCopyAdminView | null>(null);

  readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  readonly loadError = signal<string | null>(null);
  readonly publishing = signal(false);

  /** Écrire et publier : sans ce droit, l'écran se lit et rien ne part. */
  readonly canWrite = computed(() => this.permissions.can('b2b_storefront:write'));

  readonly entries = computed<readonly ShopCopyEntryView[]>(() => this.view()?.entries ?? []);
  readonly orphans = computed<readonly ShopCopyEntryView[]>(() => this.view()?.orphans ?? []);
  readonly version = computed(() => this.view()?.version ?? 0);

  /** Combien de textes, toutes langues, attendent Publier — recompté après chaque retouche. */
  readonly pendingCount = computed(
    () =>
      [...this.entries(), ...this.orphans()]
        .flatMap((entry) => COPY_LOCALES.map((locale) => entry.locales[locale]))
        .filter((view) => view.draftState !== 'unchanged').length,
  );

  /** Lecture complète. Le premier échec vide l'écran ; un rechargement raté garde ce qu'on a. */
  async load(): Promise<void> {
    if (this.view() === null) {
      this.status.set('loading');
    }
    try {
      this.view.set(await this.api.load());
      this.loadError.set(null);
      this.status.set('ready');
    } catch (error) {
      this.loadError.set(
        httpErrorMessage(error, 'Les textes de la boutique n’ont pas pu être lus.'),
      );
      if (this.view() === null) {
        this.status.set('failed');
      }
    }
  }

  /** La ligne d'une clé, manifeste ou orpheline. */
  entry(key: string): ShopCopyEntryView | null {
    return (
      this.entries().find((entry) => entry.key === key) ??
      this.orphans().find((entry) => entry.key === key) ??
      null
    );
  }

  /** Retouche une langue d'une clé après une écriture que le serveur a acceptée. */
  patch(key: string, locale: ContentLocale, change: Partial<ShopCopyLocaleView>): void {
    const view = this.view();
    if (view === null) {
      return;
    }
    const touch = (entry: ShopCopyEntryView): ShopCopyEntryView =>
      entry.key !== key
        ? entry
        : {
            ...entry,
            locales: { ...entry.locales, [locale]: { ...entry.locales[locale], ...change } },
          };
    this.view.set({ ...view, entries: view.entries.map(touch), orphans: view.orphans.map(touch) });
  }

  /** Publier tout ce qui attend, puis relire. Un refus se dit et ne change rien. */
  async publish(): Promise<void> {
    if (!this.canWrite() || this.publishing()) {
      return;
    }
    this.publishing.set(true);
    try {
      const { version } = await this.api.publish();
      this.notify.success(`Textes publiés — version ${version}.`);
      await this.load();
    } catch (error) {
      this.notify.error(error, 'La publication a échoué.');
      await this.load();
    } finally {
      this.publishing.set(false);
    }
  }
}
