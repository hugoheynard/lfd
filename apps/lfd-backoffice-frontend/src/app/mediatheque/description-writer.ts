import { Injectable, inject } from '@angular/core';
import {
  isMediaAltWritten,
  type LibraryMediaView,
  type MediaDetailsPayload,
} from '@lfd/pim-contracts';

import { NotifyService } from '../notify.service';

import type { ImagePanelResult } from './image-description';
import { MediaFeedStore } from './media-feed';
import { MediaLibraryHttpApi } from './media-library-http-api';
import { MediaSeriesStore, seriesRefOf } from './media-series';
import { TagPaletteStore } from './tag-palette';

/**
 * **Écrire ce que le panneau de l'image a décrit** — à l'avance dans le fil,
 * puis au serveur ; un refus remet l'image telle qu'elle était.
 *
 * Fourni par la page, comme le fil qu'il réécrit.
 */
@Injectable()
export class DescriptionWriter {
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly feed = inject(MediaFeedStore);
  private readonly palette = inject(TagPaletteStore);
  private readonly series = inject(MediaSeriesStore);
  private readonly notify = inject(NotifyService);

  /** Rend `false` sur refus : le panneau qui navigue reste alors sur l'image. */
  async write(result: ImagePanelResult): Promise<boolean> {
    const item = this.feed.items().find((entry) => entry.url === result.url);
    if (item === undefined) {
      return false;
    }
    const seriesMoved = result.seriesId !== (item.series?.id ?? null);
    this.feed.replace({
      ...item,
      name: result.name,
      alt: result.alt,
      focal: result.focal,
      tags: result.tags,
      series: seriesMoved ? seriesRefOf(this.series.find(result.seriesId)) : item.series,
    });
    try {
      await this.api.describe(detailsOf(item, result));
    } catch (caught) {
      this.feed.replace(item);
      this.notify.refused(caught, "L'image n'a pas pu être décrite.");
      return false;
    }
    await this.palette.refresh();
    if (seriesMoved) {
      // Le compte d'images des séries a bougé.
      await this.series.refresh();
    }
    return true;
  }
}

/** Le corps du `PUT /media` : TOUS les champs, l'écriture est un remplacement. */
function detailsOf(item: LibraryMediaView, result: ImagePanelResult): MediaDetailsPayload {
  return {
    url: item.url,
    name: result.name,
    tags: [...result.tags],
    // Une source vide veut dire « pas d'alternative » : le contrat la
    // refuserait, et le serveur retombe sur l'URL quand elle est
    // absente. On l'omet plutôt que d'envoyer un texte sans sa langue.
    ...(isMediaAltWritten(result.alt, item.url) ? { alt: result.alt } : {}),
    focal: result.focal,
    // La série part au MÊME enregistrement : un id rattache, `null` détache.
    seriesId: result.seriesId,
  };
}
