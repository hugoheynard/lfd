import type { AdminFeatureAccessView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { composeFeatureAccessBoard } from "../../domain/feature-access-board.js";
import { FeatureAccessBoardReader } from "../../domain/ports/feature-access-board.reader.js";
import { GetFeatureAccessBoardQuery } from "./get-feature-access-board.query.js";

/** Sert l'écran `/admin/feature-access`. Lecture pure. */
@QueryHandler(GetFeatureAccessBoardQuery)
export class GetFeatureAccessBoardHandler implements IQueryHandler<
  GetFeatureAccessBoardQuery,
  AdminFeatureAccessView
> {
  constructor(private readonly board: FeatureAccessBoardReader) {}

  async execute(): Promise<AdminFeatureAccessView> {
    return composeFeatureAccessBoard(await this.board.read());
  }
}
