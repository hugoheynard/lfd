import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { TvaRegimeSnapshot } from "../domain/entities/tva-regime.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";

/** Lecture des régimes de TVA — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListTvaRegimesQuery {}

@QueryHandler(ListTvaRegimesQuery)
export class ListTvaRegimesHandler implements IQueryHandler<
  ListTvaRegimesQuery,
  TvaRegimeSnapshot[]
> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  async execute(): Promise<TvaRegimeSnapshot[]> {
    const regimes = await this.regimes.listAll();
    return regimes.map((regime) => regime.snapshot());
  }
}
