import { RESUPPLY_USED_NAMES_MAX, type ResupplyUsedNamesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ResupplyUsedNames } from "../domain/resupply-used-names.js";
import { ListResupplyUsedNamesQuery } from "./list-resupply-used-names.query.js";

/** Sert les noms à proposer sur la carte « Envoyer un réassort » du fournil (R1g). */
@QueryHandler(ListResupplyUsedNamesQuery)
export class ListResupplyUsedNamesHandler implements IQueryHandler<
  ListResupplyUsedNamesQuery,
  ResupplyUsedNamesView
> {
  constructor(private readonly names: ResupplyUsedNames) {}

  async execute(query: ListResupplyUsedNamesQuery): Promise<ResupplyUsedNamesView> {
    return { names: await this.names.usedAt(query.siteId, RESUPPLY_USED_NAMES_MAX) };
  }
}
