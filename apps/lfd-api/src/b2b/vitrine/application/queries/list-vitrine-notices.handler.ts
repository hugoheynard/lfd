import type { VitrineNoticeView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineNoticeReader } from "../../domain/ports/vitrine-notice.reader.js";
import { ListVitrineNoticesQuery } from "./list-vitrine-notices.query.js";

/** Combien d'annonces l'écran montre : les dernières, pas l'archive. */
export const VITRINE_NOTICES_SHOWN = 20;

/** Les dernières annonces, de la plus récente à la plus ancienne. */
@QueryHandler(ListVitrineNoticesQuery)
export class ListVitrineNoticesHandler implements IQueryHandler<
  ListVitrineNoticesQuery,
  readonly VitrineNoticeView[]
> {
  constructor(private readonly reader: VitrineNoticeReader) {}

  execute(): Promise<readonly VitrineNoticeView[]> {
    return this.reader.recent(VITRINE_NOTICES_SHOWN);
  }
}
