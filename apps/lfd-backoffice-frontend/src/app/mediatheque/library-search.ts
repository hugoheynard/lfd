import { Injectable, computed, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';

import { MediaLibraryHttpApi } from './media-library-http-api';

/** Une page de recherche dans le fonds : de quoi choisir sans faire défiler un mur. */
const PAGE_SIZE = 24;

/**
 * **Chercher une image dans le fonds** — au serveur, par étiquette, page
 * après page. Sert à désigner une image (le remplacement) sans charger tout le
 * fil.
 *
 * Fourni par le panneau qui cherche : une recherche appartient à l'écran qui
 * l'a lancée, et le fermer l'oublie.
 */
@Injectable()
export class LibrarySearch {
  private readonly api = inject(MediaLibraryHttpApi);

  readonly term = signal('');
  readonly results = signal<readonly LibraryMediaView[]>([]);
  readonly searching = signal(false);
  readonly failure = signal<string | null>(null);
  readonly loadingMore = signal(false);
  private readonly next = signal<string | null>(null);
  readonly hasMore = computed(() => this.next() !== null);
  /** La recherche a été lancée au moins une fois. */
  private started = false;
  /** La dernière recherche lancée : une réponse plus ancienne n'écrit rien. */
  private generation = 0;

  /** Lance la première recherche, une seule fois — le fonds n'est pas lu d'office. */
  async open(): Promise<void> {
    if (!this.started) {
      await this.run();
    }
  }

  /** Une saisie posée : la recherche part au serveur. */
  async searchFor(term: string): Promise<void> {
    this.term.set(term);
    await this.run();
  }

  /**
   * Relit le fonds avec la recherche courante.
   *
   * 🔴 Seule la DERNIÈRE recherche écrit, `searching` compris : une réponse
   * lente qui le remettait à `false` éteignait le chargement d'une recherche
   * encore en vol (même garde que `media-feed.ts`, corrigé le 2026-10-11).
   */
  async run(): Promise<void> {
    const generation = ++this.generation;
    this.started = true;
    this.searching.set(true);
    this.failure.set(null);
    try {
      const page = await this.api.page({ limit: PAGE_SIZE, q: this.term() });
      if (generation === this.generation) {
        this.results.set(page.items);
        this.next.set(page.next);
      }
    } catch {
      if (generation === this.generation) {
        this.failure.set("La médiathèque n'a pas pu être lue.");
      }
    } finally {
      if (generation === this.generation) {
        this.searching.set(false);
      }
    }
  }

  /** La page suivante, ajoutée — ignorée si la recherche a changé entre-temps. */
  async more(): Promise<void> {
    const after = this.next();
    if (after === null || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    const generation = this.generation;
    try {
      const page = await this.api.page({ limit: PAGE_SIZE, q: this.term(), after });
      if (generation === this.generation) {
        this.results.update((current) => [...current, ...page.items]);
        this.next.set(page.next);
      }
    } catch {
      this.failure.set("La suite de la médiathèque n'a pas pu être lue.");
    } finally {
      this.loadingMore.set(false);
    }
  }
}
