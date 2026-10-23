import type { CollectionProcedureView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCollectionProcedureQuery } from "../application/queries/collection-procedure-queries.js";
import { parseProcedureId } from "../domain/services/collection-procedure-id.js";

/**
 * **La procédure de prélèvement** — la lecture d'état de la page du même nom
 * (plan `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * S1). Lecture seule, sous `b2b_accounting` : les gestes restent sur leurs
 * routes, sous l'écriture.
 */
@Controller("admin/accounting/collection-procedure")
@AdminSurface("b2b_accounting")
export class AdminCollectionProcedureController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * L'état des quatre onglets. `procedureId` (la ligne de la liste, § 11)
   * désigne l'entité et la clôture, sinon `legalEntityId` seule ; `batchId`
   * épingle le lot suivi (404 s'il n'est pas de l'entité).
   */
  @Get()
  read(
    @Query("legalEntityId") legalEntityId: string | undefined,
    @Query("procedureId") procedureId: string | undefined,
    @Query("batchId") batchId: string | undefined,
  ): Promise<CollectionProcedureView> {
    const address =
      procedureId === undefined || procedureId === ""
        ? { legalEntityId: legalEntityId ?? "", closureDay: null }
        : parseProcedureId(procedureId);
    return this.queries.execute<GetCollectionProcedureQuery, CollectionProcedureView>(
      new GetCollectionProcedureQuery(
        address.legalEntityId,
        batchId === undefined || batchId === "" ? null : batchId,
        address.closureDay,
      ),
    );
  }
}
