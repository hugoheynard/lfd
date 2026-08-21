import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { ProductSnapshot } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";

/** Lecture du catalogue — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListProductsQuery {}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery, ProductSnapshot[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(): Promise<ProductSnapshot[]> {
    const products = await this.products.listAll();
    return products.map((product) => product.snapshot());
  }
}
