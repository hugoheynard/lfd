import { Injectable } from "@nestjs/common";

import { MediaSeries } from "../domain/entities/media-series.js";
import {
  MediaSeriesReader,
  MediaSeriesRepository,
  type MediaSeriesLabel,
  type MediaSeriesListing,
} from "../domain/ports/media-series.js";
import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { dayColumn, readDayColumn } from "./series-day.js";

/** L'agrégat d'une série, rangé et relu. */
@Injectable()
export class PrismaMediaSeriesRepository extends MediaSeriesRepository {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async load(id: string): Promise<MediaSeries | null> {
    const row = await this.prisma.mediaSeries.findUnique({ where: { id } });
    return row === null
      ? null
      : MediaSeries.rehydrate({
          id: row.id,
          title: row.title,
          shotOn: readDayColumn(row.shotOn),
          note: row.note,
        });
  }

  async save(series: MediaSeries): Promise<void> {
    // Le laissez-passer n'est pas lu : sa seule existence prouve qu'un fait a
    // été posé (ou une dérogation nommée) avant qu'on arrive ici.
    const { id, title, shotOn, note } = series.snapshot();
    const data = { title, shotOn: dayColumn(shotOn), note };
    await this.prisma.mediaSeries.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}

/** La liste des séries, et la question « existe-t-elle ? ». */
@Injectable()
export class PrismaMediaSeriesReader extends MediaSeriesReader {
  constructor(private readonly prisma: MediaPrismaService) {
    super();
  }

  async list(): Promise<readonly MediaSeriesListing[]> {
    const rows = await this.prisma.mediaSeries.findMany({
      include: { _count: { select: { assets: true } } },
      // Les séries sans date en dernier : on ne sait pas où les ranger dans le temps.
      orderBy: [{ shotOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      shotOn: readDayColumn(row.shotOn),
      note: row.note,
      images: row._count.assets,
      createdAt: row.createdAt,
    }));
  }

  async find(id: string): Promise<MediaSeriesLabel | null> {
    return this.prisma.mediaSeries.findUnique({ where: { id }, select: { id: true, title: true } });
  }
}
