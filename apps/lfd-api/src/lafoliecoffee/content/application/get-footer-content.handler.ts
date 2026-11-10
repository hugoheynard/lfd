import type { FooterContentView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PlatformContentRepository } from "../domain/platform-content.repository.js";
import { GetFooterContentQuery } from "./get-footer-content.query.js";

/** Sert le pied de page. Lecture pure — et qui aboutit toujours (cf. le port). */
@QueryHandler(GetFooterContentQuery)
export class GetFooterContentHandler implements IQueryHandler<
  GetFooterContentQuery,
  FooterContentView
> {
  constructor(private readonly content: PlatformContentRepository) {}

  execute(): Promise<FooterContentView> {
    return this.content.readFooter();
  }
}
