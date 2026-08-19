import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  EmplacementRepository,
  type EmplacementRecord,
} from "../domain/ports/emplacement.repository.js";

/** Lecture des emplacements — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListEmplacementsQuery {}

@QueryHandler(ListEmplacementsQuery)
export class ListEmplacementsHandler implements IQueryHandler<
  ListEmplacementsQuery,
  EmplacementRecord[]
> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  execute(): Promise<EmplacementRecord[]> {
    return this.emplacements.listAll();
  }
}
