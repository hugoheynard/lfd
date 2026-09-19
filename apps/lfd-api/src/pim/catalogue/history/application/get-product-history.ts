import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductHistoryEntryView, ProductHistoryPageView } from "@lfd/pim-contracts";

import {
  ProductHistoryJournal,
  type HistoryFact,
} from "../../../journal/product-history-journal.js";
import { ProductNotFoundError } from "../../product/domain/errors/product-errors.js";
import { ProductHistoryMap } from "../domain/product-lineage.js";
import { ProductLineageReader } from "../domain/ports/product-lineage.reader.js";

export class GetProductHistoryQuery {
  constructor(
    readonly productId: string,
    readonly page: number,
    readonly pageSize: number,
    /** `null` = un instantané neuf. */
    readonly asOf: string | null,
  ) {}
}

/**
 * **L'onglet « Historique » d'une fiche** : tout ce qui l'a touchée, en une
 * page d'une seule chronologie.
 *
 * La lignée d'abord, dans les tables du référentiel ; le journal ensuite, avec
 * des identifiants déjà résolus. La chronologie est triée et paginée par le
 * journal lui-même — aucune fusion en mémoire de listes que rien ne borne.
 *
 * @throws {ProductNotFoundError} la fiche n'existe pas.
 * @throws {UnknownHistoryAnchorError} l'ancre ne désigne aucun fait des fils.
 */
@QueryHandler(GetProductHistoryQuery)
export class GetProductHistoryHandler implements IQueryHandler<
  GetProductHistoryQuery,
  ProductHistoryPageView
> {
  constructor(
    private readonly lineages: ProductLineageReader,
    private readonly journal: ProductHistoryJournal,
  ) {}

  async execute(query: GetProductHistoryQuery): Promise<ProductHistoryPageView> {
    const lineage = await this.lineages.lineageOf(query.productId);
    if (lineage === null) {
      throw new ProductNotFoundError(query.productId);
    }
    const map = ProductHistoryMap.of(lineage);
    const { facts, total, asOf } = await this.journal.page({
      threads: map.threads,
      page: query.page,
      pageSize: query.pageSize,
      asOf: query.asOf,
    });
    return {
      entries: facts.map((fact) => entryOf(fact, map)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      asOf,
    };
  }
}

function entryOf(fact: HistoryFact, map: ProductHistoryMap): ProductHistoryEntryView {
  return {
    ...map.place(fact),
    id: fact.id,
    type: fact.type,
    occurredAt: fact.occurredAt.toISOString(),
    actorName: fact.actorName,
    actorType: fact.actorType,
    payload: payloadOf(fact.payload),
    subjectType: fact.subjectType,
    subjectId: fact.subjectId,
  };
}

/** Une charge non-objet (null, tableau, scalaire) est rendue vide plutôt qu'inventée. */
function payloadOf(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return { ...raw };
}
