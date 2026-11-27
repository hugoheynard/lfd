import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type { OptionGroupPayload, OptionGroupView } from '@lfd/pim-contracts';

import { GestureIntents } from '../../shared/gesture-intents';
import { ListLoadState } from '../data/list-load-state';
import { watchPim } from '../data/watch-pim';
import { OptionGroupHttpApi } from './option-group-http-api';

/** Le sujet de l'intention de création : un seul panneau de création à la fois. */
const CREATE_GROUP_INTENT = 'option-group:create';

/**
 * Source **réactive** des groupes d'options. La page, son panneau et la carte
 * de la fiche lisent `items()` — les groupes en service, les seuls qu'on
 * active ; les archivés sont à part (`archivedItems()`), avec « Restaurer ».
 * Chaque mutation passe ici (backend puis relecture).
 */
@Injectable({ providedIn: 'root' })
export class OptionGroupStore {
  private readonly api = inject(OptionGroupHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** La clé de la création en cours, renvoyée tant qu'elle n'a pas abouti. */
  private readonly intents = new GestureIntents();

  private readonly state = signal<OptionGroupView[]>([]);
  readonly items = computed(() => this.state().filter((group) => !group.archived));
  readonly archivedItems = computed(() => this.state().filter((group) => group.archived));
  private readonly load = new ListLoadState();
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  readonly loadError = this.load.error;

  private first: Promise<void> | null = null;

  constructor() {
    if (this.isBrowser) {
      // Le seul appelant qui absorbe l'échec : la raison reste dans `loadError`.
      void this.ensure().catch(() => undefined);
      watchPim('pim_catalog:read', () => this.refresh());
    }
  }

  /** La première lecture de la session, partagée ; après un échec, la suivante relit. */
  ensure(): Promise<void> {
    this.first ??= this.reload().catch((caught: unknown) => {
      this.first = null;
      throw caught;
    });
    return this.first;
  }

  /** La relecture en fond : un échec garde la liste, sans toucher `loadError`. */
  async refresh(): Promise<void> {
    try {
      this.state.set(await this.api.list());
    } catch {
      // La liste reste : le veilleur reposera la question.
    }
  }

  async reload(): Promise<void> {
    await this.load.run(
      () => this.api.list(),
      (items) => this.state.set(items),
    );
  }

  async create(payload: OptionGroupPayload): Promise<{ id: string }> {
    const created = await this.api.create(payload, this.intents.keyFor(CREATE_GROUP_INTENT));
    this.intents.done(CREATE_GROUP_INTENT);
    await this.reload();
    return created;
  }

  async update(id: string, payload: OptionGroupPayload): Promise<void> {
    await this.api.update(id, payload);
    await this.reload();
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }

  async restore(id: string): Promise<void> {
    await this.api.restore(id);
    await this.reload();
  }
}
