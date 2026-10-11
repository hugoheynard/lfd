import { Injectable, inject } from '@angular/core';

import { NotifyService } from '../../notify.service';

import type { ImagePanelResult } from '../rules/image-description';
import { MediaFeedStore } from '../state/media-feed';
import { MediaImagesApi } from '../data/media-images-api';
import { MediaSeriesStore } from '../state/media-series';
import { seriesRefOf } from '../rules/series';
import { TagPaletteStore } from '../state/tag-palette';
import { panelDetails } from '../rules/details-payload';

/**
 * **Écrire ce que le panneau de l'image a décrit** — à l'avance dans le fil,
 * puis au serveur ; un refus remet l'image telle qu'elle était.
 *
 * Fourni par la page, comme le fil qu'il réécrit.
 */
@Injectable()
export class DescriptionWriter {
  private readonly api = inject(MediaImagesApi);
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
      await this.api.describe(panelDetails(item, result));
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
