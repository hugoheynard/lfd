import { Injectable, inject } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../auth/permissions.store';
import { NotifyService } from '../notify.service';

import { CarriersPanel, type CarriersPanelData } from './carriers-panel/carriers-panel';
import { DescriptionWriter } from './description-writer';
import { type ImagePanelData, type ImagePanelResult, describedImage } from './image-description';
import { ImagePanel } from './image-panel/image-panel';
import { MediaFeedStore } from './media-feed';
import { MediaLibraryHttpApi } from './media-library-http-api';
import { MediaSeriesStore } from './media-series';
import { carriersWording, tileLabel } from './media-wording';
import {
  ReplacePanel,
  type ReplacePanelData,
  type ReplacePanelResult,
} from './replace-panel/replace-panel';
import { TagPaletteStore } from './tag-palette';

/**
 * **Les gestes sur UNE image de la grille** — la décrire, la remplacer, voir
 * ses porteurs, la retirer du fonds. Chacun ouvre son panneau et range ce
 * qu'il rend ; la page ne fait que les brancher.
 *
 * Fourni par la page, comme le fil qu'il relit.
 */
@Injectable()
export class ImageActions {
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly feed = inject(MediaFeedStore);
  private readonly palette = inject(TagPaletteStore);
  private readonly series = inject(MediaSeriesStore);
  private readonly writer = inject(DescriptionWriter);

  /**
   * Ouvre la liste des porteurs d'une image.
   *
   * 🔴 C'est ce qui rend le refus de suppression actionnable : le compteur
   * disait « 3 emplois » sans permettre d'en trouver un seul, donc empêchait
   * le geste sans donner de quoi le débloquer.
   */
  showCarriers(item: LibraryMediaView): void {
    void this.panels.open<CarriersPanelData, void>(CarriersPanel, {
      data: { url: item.url, label: tileLabel(item) },
    });
  }

  /**
   * Ouvre le panneau qui DÉCRIT l'image — étiquette, alternatives, point
   * focal, mots-clés et série.
   *
   * 🔴 C'est le seul point où ces champs s'écrivent. Ils se saisissaient
   * depuis la fiche produit jusqu'au 2026-09-23 ; une image étant partagée, une
   * correction faite là-bas changeait silencieusement ce qu'une autre fiche
   * affichait. Les mots-clés y sont depuis le 2026-10-10 : la bande pose UN
   * mot sur beaucoup d'images, le panneau règle TOUS ceux d'une image.
   */
  async describe(item: LibraryMediaView): Promise<void> {
    const result = await this.panels.open<ImagePanelData, ImagePanelResult>(ImagePanel, {
      data: {
        ...describedImage(item),
        vocabulary: this.palette.words(),
        seriesChoices: () => this.series.all(),
        // Le fil CHARGÉ, relu à chaque pas : décrire une série sans refermer.
        sequence: {
          images: () => this.feed.items().map(describedImage),
          save: (written) => this.writer.write(written),
        },
        showCarriers: (url) => {
          const carrier = this.find(url);
          if (carrier !== undefined) {
            this.showCarriers(carrier);
          }
        },
        // Le remplacement écrit : offert seulement à qui a le droit d'écrire.
        ...(this.permissions.can('media_library:write')
          ? { replace: (url: string) => void this.replace(url) }
          : {}),
      },
    }).closed;
    if (result !== undefined) {
      await this.writer.write(result);
    }
  }

  /**
   * Ouvre le **remplacement** d'une image (`mediatheque.md` §2) — le panneau
   * de l'image se ferme, un panneau à la fois.
   *
   * Après succès, le fil est relu depuis le début : l'ancienne a perdu ses
   * porteurs, la nouvelle les a gagnés, et un dépôt a pu entrer au fonds. Le
   * panneau ne rouvre pas sur la nouvelle : le fil la montre, et le toast dit
   * ce qui a été fait.
   */
  async replace(url: string): Promise<void> {
    const item = this.find(url);
    if (item === undefined) {
      return;
    }
    const result = await this.panels.open<ReplacePanelData, ReplacePanelResult>(ReplacePanel, {
      data: {
        from: describedImage(item),
        seriesChoices: () => this.series.all(),
        lookup: (wanted) => {
          const found = this.find(wanted);
          return found === undefined ? null : describedImage(found);
        },
      },
    }).closed;
    if (result === undefined) {
      return;
    }
    this.notify.success(`Image remplacée chez ${carriersWording(result.carriers)}`);
    if (typeof result.description === 'string') {
      // Le remplacement est FAIT ; seule la reprise a échoué. Une erreur qui
      // RESTE à l'écran, pas un refus qui s'efface : elle demande un geste
      // plus tard, depuis le panneau de la nouvelle image.
      this.notify.error(
        result.description,
        `La description n'a pas été reprise : ${result.description}`,
      );
    }
    await Promise.all([this.feed.reload(), this.palette.refresh(), this.series.refresh()]);
  }

  /**
   * Retire une image du fonds — la confirmation est à l'écran, avant l'appel.
   *
   * 🔴 **L'écran ne décide pas** : il demande, le serveur refuse s'il faut, et
   * le refus s'affiche tel quel — il nomme le nombre de fiches. Recopier la
   * règle ici ferait deux sources pour un seul fait, et celle de l'écran
   * vieillirait la première.
   */
  async discard(item: LibraryMediaView): Promise<void> {
    try {
      await this.api.discard(item.url);
      this.feed.drop(item.url);
    } catch (caught) {
      // Le refus du serveur porte le NOMBRE de fiches ; `message` vaudrait
      // « Http failure response … : 409 » et ferait chercher lesquelles.
      // Un toast et pas l'état d'échec : la grille reste juste.
      this.notify.refused(caught, "L'image n'a pas pu être retirée.");
    }
  }

  private find(url: string): LibraryMediaView | undefined {
    return this.feed.items().find((entry) => entry.url === url);
  }
}
