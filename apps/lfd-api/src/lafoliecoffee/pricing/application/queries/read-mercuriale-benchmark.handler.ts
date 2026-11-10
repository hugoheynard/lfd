import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { MercurialeBenchmarkView } from "@lfd/contracts";

import { MercurialeBenchmarkQuery } from "./mercuriale-benchmark.query.js";
import { ReadMercurialeBenchmarkQuery } from "./read-mercuriale-benchmark.query.js";

/**
 * ⚠️ `MercurialeBenchmarkQuery` est le **service** qui calcule l'indicateur, pas
 * une question du bus : il garde son nom, le renommer sortirait du lot.
 */
@QueryHandler(ReadMercurialeBenchmarkQuery)
export class ReadMercurialeBenchmarkHandler implements IQueryHandler<
  ReadMercurialeBenchmarkQuery,
  readonly MercurialeBenchmarkView[]
> {
  constructor(private readonly benchmark: MercurialeBenchmarkQuery) {}

  execute(): Promise<readonly MercurialeBenchmarkView[]> {
    return this.benchmark.byProduct();
  }
}
