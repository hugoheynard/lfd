import { Injectable, computed, inject, signal } from '@angular/core';
import type { MediaTagView } from '@lfd/pim-contracts';

import { MediaLibraryHttpApi } from './media-library-http-api';

/** Un mot de la bande : son compte sur tout le fonds, et s'il n'est posé nulle part. */
export interface PaletteTag {
  readonly tag: string;
  readonly count: number;
  /** Inventé dans cet onglet et posé sur aucune image : il ne survit pas au rechargement. */
  readonly fresh: boolean;
}

/**
 * **La bande de tags** — le vocabulaire du fonds, LU AU SERVEUR.
 *
 * 🔴 Il n'y a pas de table de tags (décision Hugo, 2026-09-23) : un mot existe
 * tant qu'une image le porte. Le serveur le compte sur TOUT le fonds depuis le
 * 2026-10-10 (L1) ; la bande le dérivait jusque-là des images CHARGÉES, donc un
 * mot porté seulement hors de la page n'y figurait pas.
 *
 * Ce que quelqu'un vient d'écrire sans l'avoir posé reste affiché, à zéro,
 * jusqu'au rechargement : un mot que rien ne porte n'existe pas au fonds.
 */
@Injectable()
export class TagPaletteStore {
  private readonly api = inject(MediaLibraryHttpApi);

  /** Le vocabulaire du fonds, tel que le serveur l'a compté. */
  private readonly vocabulary = signal<readonly MediaTagView[]>([]);
  /** Ce que quelqu'un vient d'écrire et n'a pas encore posé. */
  private readonly drafted = signal<readonly string[]>([]);

  /** L'échec de la dernière lecture, `null` sinon. La bande garde ce qu'elle avait. */
  readonly failure = signal<string | null>(null);

  readonly search = signal('');

  /**
   * Le tag ARMÉ — celui qu'un clic sur une image posera.
   *
   * Il double le glisser-déposer plutôt que de le remplacer : on ne glisse pas
   * au clavier, et une bande de tags qu'on ne peut utiliser qu'à la souris
   * ferme l'écran à qui navigue autrement.
   */
  readonly armed = signal<string | null>(null);

  /** Tout le vocabulaire, trié — le fonds et les brouillons confondus. */
  readonly all = computed<readonly PaletteTag[]>(() => {
    const known = new Set(this.vocabulary().map((entry) => entry.tag));
    const fresh = this.drafted()
      .filter((tag) => !known.has(tag))
      .map((tag) => ({ tag, count: 0, fresh: true }));
    const worn = this.vocabulary().map((entry) => ({ ...entry, fresh: false }));
    return [...worn, ...fresh].sort((a, b) => a.tag.localeCompare(b.tag, 'fr'));
  });

  /** Les seuls mots, pour qui propose un complément. */
  readonly words = computed(() => this.all().map((entry) => entry.tag));

  /**
   * Ce que la bande affiche : le vocabulaire filtré par la recherche.
   *
   * Elle cherche **n'importe où** dans le mot : « sant » doit trouver
   * « croissant », sinon il faut savoir comment le tag commence pour le
   * retrouver, ce qui est exactement ce qu'on ne sait pas.
   */
  readonly shown = computed(() => {
    const needle = normalizeTag(this.search());
    if (needle === '') {
      return this.all();
    }
    return this.all().filter((entry) => entry.tag.includes(needle));
  });

  /**
   * Relit le vocabulaire. Appelé au démarrage et après chaque geste qui
   * change les tags.
   *
   * Absorbe l'échec en le disant (`failure`) : une bande illisible ne doit pas
   * faire échouer le geste qui vient de réussir.
   */
  async refresh(): Promise<void> {
    try {
      this.vocabulary.set(await this.api.tags());
      this.failure.set(null);
    } catch {
      this.failure.set("Les mots-clés du fonds n'ont pas pu être relus.");
    }
  }

  /** Le compte d'un mot sur tout le fonds — 0 s'il n'est porté nulle part. */
  countOf(tag: string): number {
    return this.vocabulary().find((entry) => entry.tag === tag)?.count ?? 0;
  }

  /**
   * Ajoute un mot à la bande sans le poser sur quoi que ce soit.
   *
   * Normalisé **ici aussi** : le serveur le refera, mais un tag qui s'affiche
   * « Croissant » puis revient « croissant » donne l'impression d'un écran qui
   * corrige en douce.
   *
   * @returns le mot normalisé, ou `null` si la saisie était vide.
   */
  draft(raw: string): string | null {
    const tag = normalizeTag(raw);
    if (tag === '') {
      return null;
    }
    if (!this.words().includes(tag)) {
      this.drafted.update((current) => [...current, tag]);
    }
    this.armed.set(tag);
    return tag;
  }

  /** Arme un tag, ou le désarme si c'était déjà lui. */
  toggle(tag: string): void {
    this.armed.update((current) => (current === tag ? null : tag));
  }

  /**
   * Renomme partout, puis relit. Le refus du serveur est RELANCÉ : l'écran
   * doit le dire, et rien n'est appliqué.
   */
  async rename(from: string, to: string): Promise<void> {
    await this.api.renameTag({ from, to });
    const written = normalizeTag(to);
    this.armed.update((current) => (current === from ? written : current));
    await this.refresh();
  }

  /** Retire partout, puis relit. Même règle d'échec que {@link rename}. */
  async remove(tag: string): Promise<void> {
    await this.api.removeTag(tag);
    this.armed.update((current) => (current === tag ? null : current));
    await this.refresh();
  }
}

/** La même normalisation que le domaine : découpé, en minuscules. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}
