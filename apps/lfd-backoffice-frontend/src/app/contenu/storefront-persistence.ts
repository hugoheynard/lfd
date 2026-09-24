import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../auth/permissions.store';
import { NotifyService } from '../notify.service';
import { catalogOf } from './storefront-catalog';
import { StorefrontEditorStore } from './storefront-editor.store';
import { payloadOf, stateOf } from './storefront-payload';
import { StorefrontService } from './storefront.service';

/** Un refus d'enregistrement. `conflict` : quelqu'un a enregistré entre-temps (409). */
export interface SaveRefusal {
  readonly message: string;
  readonly conflict: boolean;
}

/**
 * Le chargement et l'enregistrement de la vitrine éditée.
 *
 * Il charge la vitrine ENTIÈRE et la renvoie entière, avec la révision lue
 * (`plan-vitrine-enregistrement.md`, D2 et D6) : enregistrer publie. Un `409`
 * dit que quelqu'un a enregistré entre-temps ; on recharge, on ne force pas.
 *
 * Séparé de {@link StorefrontEditorStore} pour que la composition ne sache rien
 * du réseau : le store s'éprouve sans `StorefrontService`, et ce service ne
 * touche la composition que par `apply` et `catalog`. Fourni par la page.
 */
@Injectable()
export class StorefrontPersistence {
  private readonly api = inject(StorefrontService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly store = inject(StorefrontEditorStore);

  readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  readonly loadError = signal<string | null>(null);
  readonly catalogFailed = signal(false);
  readonly saving = signal(false);
  readonly saveRefusal = signal<SaveRefusal | null>(null);

  /** L'écriture : sans elle, on compose pour voir, et rien ne part. */
  readonly canWrite = computed(() => this.permissions.can('b2b_storefront:write'));

  /** Charge la vitrine et le catalogue ensemble ; seul l'échec de la vitrine vide l'écran. */
  async load(): Promise<void> {
    this.status.set('loading');
    this.saveRefusal.set(null);
    const [storefront, catalog] = await Promise.allSettled([this.api.load(), this.api.catalog()]);
    if (catalog.status === 'fulfilled') {
      this.store.catalog.set(catalogOf(catalog.value));
      this.catalogFailed.set(false);
    } else {
      this.store.catalog.set(null);
      this.catalogFailed.set(true);
    }
    if (storefront.status === 'rejected') {
      this.loadError.set(httpErrorMessage(storefront.reason, 'La vitrine n’a pas pu être lue.'));
      this.status.set('failed');
      return;
    }
    this.store.apply(stateOf(storefront.value));
    this.status.set('ready');
  }

  /** Enregistre la vitrine ENTIÈRE, puis la relit : les objets neufs y reçoivent leur identifiant. */
  async save(): Promise<void> {
    if (!this.canWrite() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveRefusal.set(null);
    try {
      await this.api.save(payloadOf(this.store.editorState()));
      this.store.apply(stateOf(await this.api.load()));
      this.notify.success('Vitrine enregistrée : la boutique la montre dès maintenant.');
    } catch (error: unknown) {
      this.saveRefusal.set({
        message: httpErrorMessage(error, 'La vitrine n’a pas été enregistrée.'),
        conflict: error instanceof HttpErrorResponse && error.status === 409,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
