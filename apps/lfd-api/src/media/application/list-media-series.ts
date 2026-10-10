import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaSeriesView } from "@lfd/pim-contracts";

import { MediaSeriesReader } from "../domain/ports/media-series.js";

/** Les séries du fonds, avec leur compte d'images (L3, 2026-10-10). */
export class ListMediaSeriesQuery {}

/** Triées par prise de vue décroissante — sans date en dernier —, puis par création. */
@QueryHandler(ListMediaSeriesQuery)
export class ListMediaSeriesHandler implements IQueryHandler<
  ListMediaSeriesQuery,
  readonly MediaSeriesView[]
> {
  constructor(private readonly series: MediaSeriesReader) {}

  async execute(): Promise<readonly MediaSeriesView[]> {
    const listing = await this.series.list();
    return listing.map((series) => ({
      id: series.id,
      title: series.title,
      shotOn: series.shotOn,
      note: series.note,
      images: series.images,
      // ISO, et pas un `Date` : ce qui sort d'ici est du JSON.
      createdAt: series.createdAt.toISOString(),
    }));
  }
}
