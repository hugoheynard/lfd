import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogReemissionView } from "@lfd/pim-contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ReemissionJobNotFoundError } from "../domain/errors/reemission-errors.js";
import { ReemissionJobReader } from "../domain/ports/reemission-job.reader.js";
import { reemissionViewOf } from "./reemission-view.js";

export class GetCatalogReemissionQuery {
  constructor(readonly id: string) {}
}

/**
 * **Un travail de réémission et son compte rendu** — ce que l'écran relit
 * jusqu'à `done` ou `failed` après avoir lancé.
 *
 * @throws {ReemissionJobNotFoundError} aucun travail n'a cet identifiant.
 */
@QueryHandler(GetCatalogReemissionQuery)
export class GetCatalogReemissionHandler implements IQueryHandler<
  GetCatalogReemissionQuery,
  CatalogReemissionView
> {
  constructor(
    private readonly reader: ReemissionJobReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetCatalogReemissionQuery): Promise<CatalogReemissionView> {
    const job = await this.reader.byId(query.id);
    if (job === null) {
      throw new ReemissionJobNotFoundError(query.id);
    }
    const authors = await this.staffAuthors.identify([job.startedBy]);
    return reemissionViewOf(job, authors);
  }
}
