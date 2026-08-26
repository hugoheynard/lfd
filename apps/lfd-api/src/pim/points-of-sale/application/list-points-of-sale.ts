import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PointOfSaleReader } from "../domain/ports/point-of-sale.reader.js";
import type { PointOfSale } from "../domain/value-objects/point-of-sale.js";

/** Lecture des points de vente — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListPointsOfSaleQuery {}

@QueryHandler(ListPointsOfSaleQuery)
export class ListPointsOfSaleHandler implements IQueryHandler<
  ListPointsOfSaleQuery,
  readonly PointOfSale[]
> {
  constructor(private readonly points: PointOfSaleReader) {}

  execute(): Promise<readonly PointOfSale[]> {
    return this.points.listAll();
  }
}
