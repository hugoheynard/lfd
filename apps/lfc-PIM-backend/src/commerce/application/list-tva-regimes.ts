import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  TvaRegimeRepository,
  type TvaRegimeRecord,
} from '../domain/ports/tva-regime.repository.js';

/** Lecture des régimes de TVA — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListTvaRegimesQuery {}

@QueryHandler(ListTvaRegimesQuery)
export class ListTvaRegimesHandler implements IQueryHandler<
  ListTvaRegimesQuery,
  TvaRegimeRecord[]
> {
  constructor(private readonly regimes: TvaRegimeRepository) {}

  execute(): Promise<TvaRegimeRecord[]> {
    return this.regimes.listAll();
  }
}
