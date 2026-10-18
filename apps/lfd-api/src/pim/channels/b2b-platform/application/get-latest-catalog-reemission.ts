import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { LatestCatalogReemissionView } from "@lfd/pim-contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ReemissionJobReader } from "../domain/ports/reemission-job.reader.js";
import { reemissionViewOf } from "./reemission-view.js";

export class GetLatestCatalogReemissionQuery {}

/**
 * **La dernière réémission**, quelle que soit sa portée : ce que l'écran
 * montre en s'ouvrant, pour qu'un travail lancé ailleurs — un autre poste, un
 * agent — se voie aussi.
 */
@QueryHandler(GetLatestCatalogReemissionQuery)
export class GetLatestCatalogReemissionHandler implements IQueryHandler<
  GetLatestCatalogReemissionQuery,
  LatestCatalogReemissionView
> {
  constructor(
    private readonly reader: ReemissionJobReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<LatestCatalogReemissionView> {
    const job = await this.reader.latest();
    if (job === null) {
      return { job: null };
    }
    const authors = await this.staffAuthors.identify([job.startedBy]);
    return { job: reemissionViewOf(job, authors) };
  }
}
