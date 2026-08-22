import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { EmplacementSnapshot } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";

/** Lecture des emplacements — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListEmplacementsQuery {}

@QueryHandler(ListEmplacementsQuery)
export class ListEmplacementsHandler implements IQueryHandler<
  ListEmplacementsQuery,
  EmplacementSnapshot[]
> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  /** La lecture rend des **instantanés**, pas des agrégats : un lecteur n'a
   *  aucune raison de pouvoir muter ce qu'il affiche. */
  async execute(): Promise<EmplacementSnapshot[]> {
    const emplacements = await this.emplacements.listAll();
    return emplacements.map((emplacement) => emplacement.snapshot());
  }
}
