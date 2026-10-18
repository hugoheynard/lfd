import type { VitrineTextsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineShowcaseSource } from "../../domain/ports/vitrine-showcase.source.js";
import { VitrineSubscriberReader } from "../../domain/ports/vitrine-subscriber.reader.js";
import { vitrineTextsOf } from "../../domain/services/vitrine-view.js";
import { contentsOfReadKey } from "../vitrine-read-support.js";
import { ReadVitrineTextsQuery } from "./read-vitrine-texts.query.js";

/**
 * Les textes de la boutique tels qu'elle les AFFICHE (S1) : le publié s'il
 * existe, sinon le texte du code — « Incontournable » (`product.bestSeller`)
 * compris. Vides si l'abonné ne reçoit pas les textes.
 */
@QueryHandler(ReadVitrineTextsQuery)
export class ReadVitrineTextsHandler implements IQueryHandler<
  ReadVitrineTextsQuery,
  VitrineTextsView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberReader,
    private readonly showcase: VitrineShowcaseSource,
  ) {}

  async execute(query: ReadVitrineTextsQuery): Promise<VitrineTextsView> {
    const contents = await contentsOfReadKey(this.subscribers, query.readKey);
    const texts = contents.has("texts") ? await this.showcase.texts(query.language) : {};
    return { language: query.language, texts: vitrineTextsOf(texts, contents) };
  }
}
