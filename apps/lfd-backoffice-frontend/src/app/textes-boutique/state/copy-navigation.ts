import { computed, inject, Injectable, signal } from '@angular/core';
import type { ShopCopyEntryView } from '@lfd/contracts';

import { matchesSearch } from '../rules/copy-search';
import { passes, spaceTree, type SpaceFilter, type SpaceNode } from '../rules/space-tree';
import { ShopCopyStore } from './shop-copy-store';

/**
 * **Où l'on est dans les textes** — l'espace ouvert, la clé en cours, la
 * recherche, et le filtre « seulement ce que l'aperçu montre ».
 *
 * Séparé du store : la navigation ne parle pas au réseau, et le store ne sait
 * pas ce qu'on regarde. Fourni par la page.
 */
@Injectable()
export class CopyNavigation {
  private readonly store = inject(ShopCopyStore);

  readonly query = signal('');
  readonly selectedSpace = signal<string | null>(null);
  readonly selectedKey = signal<string | null>(null);
  /** Les clés que l'aperçu dit montrer ; `null` tant qu'il n'a rien dit. */
  readonly visibleKeys = signal<ReadonlySet<string> | null>(null);
  readonly onlyVisible = signal(false);

  private readonly filter = computed<SpaceFilter>(() => {
    const query = this.query();
    return {
      matches: (entry) => matchesSearch(entry, query),
      visibleKeys: this.onlyVisible() ? (this.visibleKeys() ?? new Set<string>()) : null,
    };
  });

  readonly tree = computed<readonly SpaceNode[]>(() =>
    spaceTree(this.store.entries(), this.filter()),
  );

  /** L'espace affiché : celui choisi s'il est encore dans l'arbre, sinon le premier. */
  readonly currentSpace = computed<SpaceNode | null>(() => {
    const tree = this.tree();
    return tree.find((node) => node.space === this.selectedSpace()) ?? tree[0] ?? null;
  });

  readonly spaceEntries = computed<readonly ShopCopyEntryView[]>(() => {
    const space = this.currentSpace()?.space ?? null;
    const filter = this.filter();
    return this.store.entries().filter((entry) => entry.space === space && passes(entry, filter));
  });

  /** Les orphelines suivent la recherche, jamais l'aperçu : il ne les connaît pas. */
  readonly orphans = computed<readonly ShopCopyEntryView[]>(() => {
    const query = this.query();
    return this.store.orphans().filter((entry) => matchesSearch(entry, query));
  });

  /** Combien de clés la recherche et le filtre retiennent, toutes espaces. */
  readonly resultCount = computed(() => this.tree().reduce((sum, node) => sum + node.count, 0));

  openSpace(space: string): void {
    this.selectedSpace.set(space);
    this.selectedKey.set(null);
  }

  /** Ouvre une clé — depuis l'aperçu (« pick ») ou la liste. Une clé inconnue est ignorée. */
  openKey(key: string): void {
    const entry = this.store.entry(key);
    if (entry === null) {
      return;
    }
    if (entry.space !== null) {
      // La clé doit être visible : on lève ce qui la cacherait.
      if (!passes(entry, this.filter())) {
        this.query.set('');
        this.onlyVisible.set(false);
      }
      this.selectedSpace.set(entry.space);
    }
    this.selectedKey.set(key);
  }

  setVisibleKeys(keys: readonly string[]): void {
    this.visibleKeys.set(new Set(keys));
  }
}
