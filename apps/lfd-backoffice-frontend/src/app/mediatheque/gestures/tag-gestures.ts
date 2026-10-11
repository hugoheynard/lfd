import { Injectable, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';

import { NotifyService } from '../../notify.service';

import { MediaFeedStore } from '../state/media-feed';
import { MediaImagesApi } from '../data/media-images-api';
import { TagPaletteStore } from '../state/tag-palette';
import { tagsOnly } from '../rules/details-payload';

/** Le temps laissé pour annuler un retrait sur tuile. Le compte à rebours
 *  de `fold-toast` se met en pause sous le pointeur ou le clavier. */
export const UNDO_MS = 6000;

/** Un retrait sur tuile qu'on peut encore annuler. `id` rejoue le compte à rebours. */
export interface StrippedTag {
  readonly id: number;
  readonly url: string;
  readonly tag: string;
  /** Sa place dans la liste de l'image : l'annulation le remet où il était. */
  readonly index: number;
}

/**
 * **Poser, retirer, reposer UN mot sur UNE image** — depuis la grille.
 *
 * Les trois gestes suivent le même patron, écrit une fois ({@link rewrite}) :
 * la tuile bascule d'abord — reposer un mot ne mérite pas d'attendre le
 * réseau —, puis le serveur ; un refus remet l'image telle qu'elle était et
 * se dit en toast. Un toast et pas l'échec du fil : la grille reste juste,
 * seul ce geste a échoué.
 *
 * Fourni par la page, comme le fil qu'il réécrit.
 */
@Injectable()
export class TagGestures {
  private readonly api = inject(MediaImagesApi);
  private readonly feed = inject(MediaFeedStore);
  private readonly palette = inject(TagPaletteStore);
  private readonly notify = inject(NotifyService);

  /** Le dernier retrait sur tuile, tant qu'on peut l'annuler. Un seul à la fois. */
  readonly stripped = signal<readonly StrippedTag[]>([]);
  private readonly strips = signal(0);

  /**
   * Pose sur une image le mot qu'on lui amène.
   *
   * Le geste est idempotent — une image qui porte déjà le mot n'appelle pas le
   * serveur. Sans cette garde, glisser deux fois de suite écrirait deux fois la
   * même chose, et chaque relâché coûterait un aller-retour.
   */
  async apply(item: LibraryMediaView, tag: string | null): Promise<void> {
    if (tag === null || item.tags.includes(tag)) {
      return;
    }
    await this.rewrite(item, [...item.tags, tag], "Le mot-clé n'a pas pu être posé.");
  }

  /**
   * Retire un mot d'une image — immédiat, puis « Annuler » quelques secondes
   * (Hugo, 2026-10-10 ; `mediatheque.md` §5, « Les tags à l'écran »).
   */
  async strip(item: LibraryMediaView, tag: string): Promise<void> {
    const index = item.tags.indexOf(tag);
    const tags = item.tags.filter((kept) => kept !== tag);
    const written = await this.rewrite(item, tags, "Le mot-clé n'a pas pu être retiré.");
    if (written) {
      this.strips.update((count) => count + 1);
      this.stripped.set([{ id: this.strips(), url: item.url, tag, index }]);
    }
  }

  /**
   * Repose le mot retiré, à sa place, par le même `PUT /media`.
   *
   * Relu sur l'image COURANTE et pas sur celle du retrait : un autre mot a pu
   * être posé entre-temps, et le remplacement l'effacerait.
   */
  async undo(last: StrippedTag): Promise<void> {
    this.stripped.set([]);
    const item = this.feed.items().find((entry) => entry.url === last.url);
    if (item === undefined || item.tags.includes(last.tag)) {
      return;
    }
    const tags = [...item.tags];
    tags.splice(Math.min(last.index, tags.length), 0, last.tag);
    await this.rewrite(item, tags, "Le mot-clé n'a pas pu être reposé.");
  }

  dismiss(): void {
    this.stripped.set([]);
  }

  /**
   * Réécrit les mots d'une image, à l'avance dans le fil puis au serveur, et
   * relit le vocabulaire. Rend `false` sur refus — l'image est alors remise.
   */
  private async rewrite(
    item: LibraryMediaView,
    tags: readonly string[],
    refusal: string,
  ): Promise<boolean> {
    this.feed.replace({ ...item, tags });
    try {
      await this.api.describe(tagsOnly(item, tags));
    } catch (caught) {
      this.feed.replace(item);
      this.notify.refused(caught, refusal);
      return false;
    }
    // Le vocabulaire relu absorbe son propre échec (`palette.failure`) : le
    // mot est écrit, la bande le dira au prochain chargement.
    await this.palette.refresh();
    return true;
  }
}
