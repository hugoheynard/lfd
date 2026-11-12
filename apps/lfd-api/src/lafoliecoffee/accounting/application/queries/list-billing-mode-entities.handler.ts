import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { BillingModeEntityView } from "@lfd/contracts";

import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { livingBillingModeEntities } from "./billing-mode-entities.js";
import { ListBillingModeEntitiesQuery } from "./list-billing-mode-entities.query.js";

/**
 * Les entités en service, pour le choix du mode à l'**ouverture** d'un compte,
 * quand la société n'existe pas encore (décidé par Hugo le 2026-11-12) : sous
 * le droit sociétés, sans lecture comptable.
 */
@QueryHandler(ListBillingModeEntitiesQuery)
export class ListBillingModeEntitiesHandler implements IQueryHandler<
  ListBillingModeEntitiesQuery,
  readonly BillingModeEntityView[]
> {
  constructor(private readonly entities: LegalEntityReader) {}

  execute(): Promise<readonly BillingModeEntityView[]> {
    return livingBillingModeEntities(this.entities);
  }
}
