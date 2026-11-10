import type { VitrineItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineArticleNotFoundError } from "../../domain/errors/vitrine-errors.js";
import { VitrineShopOrigin } from "../../domain/ports/vitrine-shop-origin.js";
import { VitrineShowcaseSource } from "../../domain/ports/vitrine-showcase.source.js";
import { VitrineSubscriberReader } from "../../domain/ports/vitrine-subscriber.reader.js";
import { vitrineCatalogueOf } from "../../domain/services/vitrine-view.js";
import { contentsOfReadKey } from "../vitrine-read-support.js";
import { ReadVitrineArticleQuery } from "./read-vitrine-article.query.js";

/**
 * Un article, après une notification qui le nomme. Lu dans la MÊME vue que
 * le catalogue entier, puis cherché : un article pro, masqué ou hors des
 * cases de l'abonné est introuvable ici exactement comme là.
 */
@QueryHandler(ReadVitrineArticleQuery)
export class ReadVitrineArticleHandler implements IQueryHandler<
  ReadVitrineArticleQuery,
  VitrineItemView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberReader,
    private readonly showcase: VitrineShowcaseSource,
    private readonly origin: VitrineShopOrigin,
  ) {}

  async execute(query: ReadVitrineArticleQuery): Promise<VitrineItemView> {
    const contents = await contentsOfReadKey(this.subscribers, query.readKey);
    const view = vitrineCatalogueOf(
      await this.showcase.catalogue(query.language),
      contents,
      query.language,
      this.origin.clientBaseUrl(),
    );
    const item = view.items.find((candidate) => candidate.sku === query.sku);
    if (item === undefined) {
      throw new VitrineArticleNotFoundError(query.sku);
    }
    return item;
  }
}
