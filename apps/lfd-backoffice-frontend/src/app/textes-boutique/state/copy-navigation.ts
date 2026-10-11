import { computed, inject, Injectable, signal } from '@angular/core';
import type { ContentLocale, ShopCopyEntryView } from '@lfd/contracts';
import { SHOP_COPY_AUDIENCES, type ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import { matchesSearch } from '../rules/copy-search';
import { COPY_LOCALES } from '../rules/copy-text';
import { isSeenBy, isUnshown } from '../rules/space-audiences';
import { passes, spaceTree, type SpaceFilter, type SpaceNode } from '../rules/space-tree';
import { ShopCopyStore } from './shop-copy-store';

/** Où l'écran garde la langue choisie, d'une visite à l'autre. */
export const COPY_LOCALE_STORAGE_KEY = 'lfd.shop-copy.locale';
/** Où l'écran garde la clientèle choisie. */
export const COPY_AUDIENCE_STORAGE_KEY = 'lfd.shop-copy.audience';

/**
 * Ce que la colonne des espaces montre :
 * - `preview` — ce que l'aperçu affiche, en direct (le comportement ordinaire) ;
 * - `all` — tous les textes de la clientèle (« Voir tous les textes ») : le
 *   recours pour un texte que l'aperçu ne montre pas (une erreur, un état vide) ;
 * - `search` — une recherche en cours, dans tous les textes de la clientèle.
 */
export type CopyListMode = 'preview' | 'all' | 'search';

function storedAudience(): ShopCopyAudience {
  try {
    const stored = localStorage.getItem(COPY_AUDIENCE_STORAGE_KEY);
    return SHOP_COPY_AUDIENCES.find((audience) => audience === stored) ?? 'visitor';
  } catch {
    // Stockage refusé : on repart de qui n'est pas connecté.
    return 'visitor';
  }
}

function storedLocale(): ContentLocale {
  try {
    const stored = localStorage.getItem(COPY_LOCALE_STORAGE_KEY);
    return COPY_LOCALES.find((locale) => locale === stored) ?? 'fr';
  } catch {
    // Stockage refusé (navigation privée, quota) : on repart du français.
    return 'fr';
  }
}

/**
 * **Où l'on est dans les textes** — la clientèle, l'espace ouvert, la clé en
 * cours, la recherche ; et ce que l'aperçu montre, qui est la colonne des
 * espaces tant qu'on ne demande pas tout (Hugo, 2026-10-11).
 *
 * Séparé du store : la navigation ne parle pas au réseau, et le store ne sait
 * pas ce qu'on regarde. Fourni par la page.
 */
@Injectable()
export class CopyNavigation {
  private readonly store = inject(ShopCopyStore);

  /**
   * La langue affichée : celle qu'on édite, que l'aperçu montre, et dans
   * laquelle on cherche. Une seule à la fois — c'est ce qui rend la colonne lisible.
   */
  readonly locale = signal<ContentLocale>(storedLocale());
  /** Qui regarde : pilote l'aperçu, les espaces et la recherche. */
  readonly audience = signal<ShopCopyAudience>(storedAudience());
  readonly query = signal('');
  readonly selectedSpace = signal<string | null>(null);
  readonly selectedKey = signal<string | null>(null);
  /** Les clés que l'aperçu dit montrer, dans son ordre ; `null` tant qu'il n'a rien dit. */
  readonly visibleKeys = signal<readonly string[] | null>(null);
  /** « Voir tous les textes » : la liste complète de la clientèle plutôt que l'aperçu. */
  readonly showAll = signal(false);

  readonly mode = computed<CopyListMode>(() => {
    if (this.query().trim() !== '') {
      return 'search';
    }
    return this.showAll() ? 'all' : 'preview';
  });

  private readonly filter = computed<SpaceFilter>(() => {
    const query = this.query();
    const locale = this.locale();
    const audience = this.audience();
    return {
      matches: (entry) => matchesSearch(entry, query, locale),
      spaces: (space) => isSeenBy(space, audience),
      // Tant que l'aperçu n'a rien dit, la colonne est vide — et le dit.
      visibleKeys: this.mode() === 'preview' ? (this.visibleKeys() ?? []) : null,
    };
  });

  readonly tree = computed<readonly SpaceNode[]>(() => [
    ...spaceTree(this.store.entries(), this.filter()),
    ...this.unshownTree(),
  ]);

  /** Les espaces que personne ne voit aujourd'hui — seulement dans la liste complète. */
  readonly unshownTree = computed<readonly SpaceNode[]>(() =>
    this.mode() === 'all'
      ? spaceTree(this.store.entries(), {
          matches: () => true,
          spaces: isUnshown,
          visibleKeys: null,
        })
      : [],
  );

  /** Les espaces de la clientèle, sans ceux que personne ne voit. */
  readonly audienceTree = computed<readonly SpaceNode[]>(() => {
    const unshown = new Set(this.unshownTree().map((node) => node.space));
    return this.tree().filter((node) => !unshown.has(node.space));
  });

  /** L'espace affiché : celui choisi s'il est encore dans l'arbre, sinon le premier. */
  readonly currentSpace = computed<SpaceNode | null>(() => {
    const tree = this.tree();
    return tree.find((node) => node.space === this.selectedSpace()) ?? tree[0] ?? null;
  });

  readonly spaceEntries = computed<readonly ShopCopyEntryView[]>(() => {
    const node = this.currentSpace();
    const space = node?.space ?? null;
    const filter =
      space !== null && isUnshown(space)
        ? { matches: () => true, visibleKeys: null }
        : this.filter();
    return this.store.entries().filter((entry) => entry.space === space && passes(entry, filter));
  });

  /** Les orphelines suivent la recherche, jamais l'aperçu : il ne les connaît pas. */
  readonly orphans = computed<readonly ShopCopyEntryView[]>(() => {
    const query = this.query();
    const locale = this.locale();
    return this.store.orphans().filter((entry) => matchesSearch(entry, query, locale));
  });

  /** Combien de clés la colonne montre, tous espaces — le compteur « N textes ». */
  readonly resultCount = computed(() => this.tree().reduce((sum, node) => sum + node.count, 0));

  setLocale(value: string): void {
    const locale = COPY_LOCALES.find((candidate) => candidate === value);
    if (locale === undefined) {
      return;
    }
    this.locale.set(locale);
    try {
      localStorage.setItem(COPY_LOCALE_STORAGE_KEY, locale);
    } catch {
      // Sans stockage, le choix vaut pour la visite : rien à dire de plus.
    }
  }

  /** Change de clientèle, et s'en souvient. L'étape de l'aperçu, elle, reste. */
  setAudience(value: string): void {
    const audience = SHOP_COPY_AUDIENCES.find((candidate) => candidate === value);
    if (audience === undefined) {
      return;
    }
    this.audience.set(audience);
    // L'ancienne liste de l'aperçu ne vaut plus : on attend la nouvelle.
    this.visibleKeys.set(null);
    try {
      localStorage.setItem(COPY_AUDIENCE_STORAGE_KEY, audience);
    } catch {
      // Sans stockage, le choix vaut pour la visite.
    }
  }

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
        this.showAll.set(true);
      }
      this.selectedSpace.set(entry.space);
    }
    this.selectedKey.set(key);
  }

  setVisibleKeys(keys: readonly string[]): void {
    this.visibleKeys.set([...keys]);
  }
}
