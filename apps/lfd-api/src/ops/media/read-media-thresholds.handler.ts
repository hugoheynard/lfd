import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MediaThresholdsReport } from "@lfd/ops-contract";

import { MediaLibraryCensus } from "../../platform/storage/media-library-census.js";
import { Clock } from "../../platform/time/clock.js";
import { mediaThresholds } from "./media-thresholds.js";
import { ReadMediaThresholdsQuery } from "./read-media-thresholds.query.js";

/**
 * Compte le fonds, puis le juge. Le jugement est dans `mediaThresholds`, pur ;
 * ici il n'y a que la collecte.
 *
 * Route à part de `/admin/ops/health` et de la readiness, exprès : un seuil
 * approché n'est pas une panne, et une base lente ne doit pas faire tomber ce
 * qui dit si le processus vit (CLAUDE.md §7).
 */
@QueryHandler(ReadMediaThresholdsQuery)
export class ReadMediaThresholdsHandler implements IQueryHandler<
  ReadMediaThresholdsQuery,
  MediaThresholdsReport
> {
  constructor(
    private readonly census: MediaLibraryCensus,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MediaThresholdsReport> {
    const images = await this.census.countImages();
    return {
      generatedAt: this.clock.now().toISOString(),
      images,
      thresholds: mediaThresholds(images),
    };
  }
}
