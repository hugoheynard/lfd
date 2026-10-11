import { computed, signal } from '@angular/core';

import type { ImagePanelSequence } from '../rules/image-description';
import { neighboursOf } from '../rules/image-pointing';
import type { ImageDraft } from './image-draft';

/**
 * **Le parcours d'une suite d'images** depuis le panneau « Décrire une
 * image » — les voisines, et le pas de l'une à l'autre.
 *
 * Une saisie en cours s'ENREGISTRE avant de passer, sans demander : on décrit
 * une série pour aller vite, et une question à chaque image ferait cliquer
 * « oui » sans lire. Un refus du serveur retient sur l'image, saisie intacte.
 */
export class ImageWalk {
  /** Une navigation enregistre : les flèches attendent. */
  readonly moving = signal(false);

  private readonly neighbours = computed(() =>
    neighboursOf(this.sequence()?.images() ?? [], this.draft.shown()?.url ?? null),
  );

  readonly hasSequence = computed(() => this.sequence() !== undefined);
  readonly previous = computed(() => this.neighbours().previous);
  readonly next = computed(() => this.neighbours().next);

  constructor(
    private readonly sequence: () => ImagePanelSequence | undefined,
    private readonly draft: ImageDraft,
  ) {}

  /** Passe à la voisine ; rend `true` quand on y est arrivé. */
  async go(direction: 'previous' | 'next'): Promise<boolean> {
    const target = direction === 'previous' ? this.previous() : this.next();
    const sequence = this.sequence();
    if (target === null || sequence === undefined || this.moving()) {
      return false;
    }
    if (this.draft.dirty()) {
      this.moving.set(true);
      let saved = false;
      try {
        saved = await sequence.save(this.draft.result());
      } finally {
        // Un `save` qui lève ne doit pas laisser les flèches bloquées.
        this.moving.set(false);
      }
      if (!saved) {
        return false;
      }
    }
    this.draft.load(target);
    return true;
  }
}
