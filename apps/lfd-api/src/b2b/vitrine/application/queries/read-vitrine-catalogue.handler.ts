import type { VitrineCatalogueView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineShowcaseSource } from "../../domain/ports/vitrine-showcase.source.js";
import { VitrineSubscriberReader } from "../../domain/ports/vitrine-subscriber.reader.js";
import { vitrineCatalogueOf } from "../../domain/services/vitrine-view.js";
import { contentsOfReadKey } from "../vitrine-read-support.js";
import { ReadVitrineCatalogueQuery } from "./read-vitrine-catalogue.query.js";

/**
 * **Tout le catalogue de l'agence** — la première synchronisation et les
 * rattrapages (W6). La vue publique de la boutique, filtrée par les cases de
 * l'abonné que la clé désigne.
 */
@QueryHandler(ReadVitrineCatalogueQuery)
export class ReadVitrineCatalogueHandler implements IQueryHandler<
  ReadVitrineCatalogueQuery,
  VitrineCatalogueView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberReader,
    private readonly showcase: VitrineShowcaseSource,
  ) {}

  async execute(query: ReadVitrineCatalogueQuery): Promise<VitrineCatalogueView> {
    const contents = await contentsOfReadKey(this.subscribers, query.readKey);
    return vitrineCatalogueOf(
      await this.showcase.catalogue(query.language),
      contents,
      query.language,
    );
  }
}
