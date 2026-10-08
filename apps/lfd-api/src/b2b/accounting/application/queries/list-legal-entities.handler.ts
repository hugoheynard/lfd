import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { LegalEntityView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LastAutopilotRunReader } from "../../domain/ports/last-autopilot-run.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { RecordedClosureReader } from "../../domain/ports/recorded-closure.reader.js";
import { withNextCollection } from "../legal-entity-view-support.js";
import { ListLegalEntitiesQuery } from "./legal-entity-queries.js";

/**
 * Toutes les entités émettrices, chacune avec le calendrier de son cycle.
 *
 * Sans pagination, et c'est délibéré : une entreprise en a une, deux si elle
 * scinde son activité. Paginer une liste qui ne dépassera jamais la dizaine
 * ajouterait un curseur à tenir, un état à l'écran, et une classe de bugs, pour
 * une économie nulle — et une lecture de clôture par entité ne coûte rien de
 * plus à cette échelle.
 */
@QueryHandler(ListLegalEntitiesQuery)
export class ListLegalEntitiesHandler implements IQueryHandler<
  ListLegalEntitiesQuery,
  readonly LegalEntityView[]
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly closures: RecordedClosureReader,
    private readonly autopilotRuns: LastAutopilotRunReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly LegalEntityView[]> {
    const now = this.clock.now();
    const records = await this.entities.list();
    return Promise.all(
      records.map((record) =>
        withNextCollection(
          record,
          { closures: this.closures, autopilotRuns: this.autopilotRuns },
          now,
        ),
      ),
    );
  }
}
