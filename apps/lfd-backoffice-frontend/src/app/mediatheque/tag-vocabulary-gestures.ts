import { Injectable, inject } from '@angular/core';
import type { MediaTagView } from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';

import { NotifyService } from '../notify.service';

import { imagesLabel } from './media-wording';
import { TagPaletteStore, type PaletteTag } from './tag-palette';
import { TagRemovePanel, type TagRemovePanelData } from './tag-remove-panel/tag-remove-panel';
import {
  TagRenamePanel,
  type TagRenamePanelData,
  type TagRenamePanelResult,
} from './tag-rename-panel/tag-rename-panel';

/**
 * **Renommer ou retirer un mot PARTOUT** — depuis le menu d'une pastille de
 * la bande. Chaque geste demande d'abord (le panneau annonce une fusion, ou
 * donne le compte), écrit, puis le dit.
 *
 * Fourni par la page, comme la bande qu'il relit.
 */
@Injectable()
export class TagVocabularyGestures {
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly palette = inject(TagPaletteStore);

  /**
   * Renomme un mot partout — ou le fusionne, si le nouveau existe déjà.
   *
   * @returns le mot écrit, ou `null` si l'on a annulé ou que le serveur a refusé.
   */
  async rename(entry: PaletteTag): Promise<string | null> {
    const result = await this.panels.open<TagRenamePanelData, TagRenamePanelResult>(
      TagRenamePanel,
      { data: { tag: { tag: entry.tag, count: entry.count }, vocabulary: this.vocabulary() } },
    ).closed;
    if (result === undefined) {
      return null;
    }
    const merged = this.vocabulary().some((known) => known.tag === result.to);
    try {
      await this.palette.rename(entry.tag, result.to);
    } catch (caught) {
      this.notify.refused(caught, "Le mot-clé n'a pas pu être renommé.");
      return null;
    }
    this.notify.success(merged ? 'Mots-clés fusionnés' : 'Mot-clé renommé');
    return result.to;
  }

  /**
   * Retire un mot de tout le fonds, après une confirmation qui donne le compte.
   *
   * @returns `true` si le mot est retiré.
   */
  async remove(entry: PaletteTag): Promise<boolean> {
    const confirmed = await this.panels.open<TagRemovePanelData, true>(TagRemovePanel, {
      data: { tag: { tag: entry.tag, count: entry.count } },
    }).closed;
    if (confirmed !== true) {
      return false;
    }
    try {
      await this.palette.remove(entry.tag);
    } catch (caught) {
      this.notify.refused(caught, "Le mot-clé n'a pas pu être retiré.");
      return false;
    }
    this.notify.success(`Mot-clé retiré de ${imagesLabel(entry.count)}`);
    return true;
  }

  /** Le vocabulaire du serveur, tel que les panneaux le comparent. */
  private vocabulary(): readonly MediaTagView[] {
    return this.palette
      .all()
      .filter((entry) => !entry.fresh)
      .map(({ tag, count }) => ({ tag, count }));
  }
}
