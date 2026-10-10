import { Injectable, computed, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { ALL_MEDIA, toPageRequest, type MediaFeedCriteria } from './media-feed-url';
import { MediaLibraryHttpApi } from './media-library-http-api';

/** Une page d'aperçus. Le serveur reborne de toute façon à 100. */
export const FEED_PAGE_SIZE = 60;

/**
 * **Le fil de la médiathèque** — les pages lues par curseur, mises bout à bout.
 *
 * 🔴 Un changement de critère repart du DÉBUT, sans curseur : un curseur
 * encode la clé du tri qui l'a produit, et le rejouer sous un autre tri ou un
 * autre filtre reprendrait au milieu d'une autre liste.
 *
 * 🔴 C'est `next`, et lui seul, qui dit s'il reste à lire. Le filtre
 * « Inutilisées » se fait hors base et peut rendre une page courte — voire
 * vide — avec une suite (plan L2, point 3) ; compter les images reçues contre
 * `total` s'arrêterait trop tôt.
 *
 * Une réponse arrivée après un changement de critère est jetée : sans quoi
 * une lecture lente de l'ancien filtre viendrait se coller sous le nouveau.
 */
@Injectable()
export class MediaFeedStore {
  private readonly api = inject(MediaLibraryHttpApi);

  readonly items = signal<readonly LibraryMediaView[]>([]);
  /** Le total DU FILTRE, `null` tant que la première page n'est pas lue. */
  readonly total = signal<number | null>(null);
  readonly loading = signal(false);
  /**
   * Le message d'un échec, `null` sinon — celui du serveur quand il en dit
   * un (le 409 du tri par emplois sur un fonds trop grand nomme le cas).
   */
  readonly failure = signal<string | null>(null);
  /** Combien de pages ont été lues depuis le dernier départ. */
  readonly pages = signal(0);

  private readonly next = signal<string | null>(null);
  private criteria: MediaFeedCriteria = ALL_MEDIA;
  private generation = 0;

  readonly hasMore = computed(() => this.next() !== null);
  /** La fin n'est dite que si l'on a défilé : sur une seule page, elle se voit. */
  readonly ended = computed(() => this.next() === null && this.pages() > 1);

  /** Relit depuis le début, sous de nouveaux critères. */
  async restart(criteria: MediaFeedCriteria): Promise<void> {
    this.criteria = criteria;
    this.generation += 1;
    this.items.set([]);
    this.total.set(null);
    this.next.set(null);
    this.pages.set(0);
    await this.fetch(null);
  }

  /** La page suivante, s'il y en a une et qu'aucune lecture n'est en vol. */
  async more(): Promise<void> {
    const after = this.next();
    if (after === null || this.loading() || this.failure() !== null) {
      return;
    }
    await this.fetch(after);
  }

  /** Rejoue ce qui a échoué : le départ s'il n'a rien rendu, sinon la suite. */
  async retry(): Promise<void> {
    if (this.pages() === 0) {
      await this.restart(this.criteria);
      return;
    }
    this.failure.set(null);
    await this.more();
  }

  /** Une image décrite ou retaguée : remplacée sur place. */
  replace(item: LibraryMediaView): void {
    this.items.update((current) => current.map((entry) => (entry.url === item.url ? item : entry)));
  }

  /** Une image retirée du fonds. Le curseur ne bouge pas : il ne compte rien. */
  drop(url: string): void {
    this.items.update((current) => current.filter((entry) => entry.url !== url));
    this.total.update((current) => (current === null ? null : Math.max(current - 1, 0)));
  }

  private async fetch(after: string | null): Promise<void> {
    const generation = this.generation;
    this.loading.set(true);
    this.failure.set(null);
    try {
      const page = await this.api.page(toPageRequest(this.criteria, FEED_PAGE_SIZE, after));
      if (generation !== this.generation) {
        return;
      }
      this.items.update((current) => [...current, ...page.items]);
      this.total.set(page.total);
      this.next.set(page.next);
      this.pages.update((count) => count + 1);
    } catch (caught) {
      if (generation === this.generation) {
        this.failure.set(httpErrorMessage(caught, "La médiathèque n'a pas pu être lue."));
      }
    } finally {
      if (generation === this.generation) {
        this.loading.set(false);
      }
    }
  }
}
