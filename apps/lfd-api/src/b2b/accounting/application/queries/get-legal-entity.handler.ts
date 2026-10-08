import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { LegalEntityView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { RecordedClosureReader } from "../../domain/ports/recorded-closure.reader.js";
import { withNextCollection } from "../legal-entity-view-support.js";
import { GetLegalEntityQuery } from "./legal-entity-queries.js";

/**
 * Une entité par son identifiant, avec le calendrier de son cycle en cours.
 *
 * Refuse en 404 plutôt que de rendre `null` : l'appelant est un écran qui vient
 * d'un lien, et « la fiche n'existe pas » est une réponse, pas un vide à
 * interpréter. Le port, lui, rend `null` — c'est le handler qui tranche ce que
 * l'absence veut dire ici.
 */
@QueryHandler(GetLegalEntityQuery)
export class GetLegalEntityHandler implements IQueryHandler<GetLegalEntityQuery, LegalEntityView> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly closures: RecordedClosureReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetLegalEntityQuery): Promise<LegalEntityView> {
    const entity = await this.entities.byId(query.legalEntityId);
    if (entity === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    return withNextCollection(entity, this.closures, this.clock.now());
  }
}
