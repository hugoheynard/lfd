import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { LegalEntityView } from "@lfd/contracts";

import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { ListLegalEntitiesQuery } from "./legal-entity-queries.js";

/**
 * Toutes les entités émettrices.
 *
 * Sans pagination, et c'est délibéré : une entreprise en a une, deux si elle
 * scinde son activité. Paginer une liste qui ne dépassera jamais la dizaine
 * ajouterait un curseur à tenir, un état à l'écran, et une classe de bugs, pour
 * une économie nulle.
 */
@QueryHandler(ListLegalEntitiesQuery)
export class ListLegalEntitiesHandler implements IQueryHandler<
  ListLegalEntitiesQuery,
  readonly LegalEntityView[]
> {
  constructor(private readonly entities: LegalEntityReader) {}

  async execute(): Promise<readonly LegalEntityView[]> {
    return this.entities.list();
  }
}
