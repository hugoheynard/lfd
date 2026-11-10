import type { CollectionProcedureListView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListCollectionProceduresQuery } from "../application/queries/collection-procedure-queries.js";

/**
 * **La liste des procédures de prélèvement** — l'arrivée de la page (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * § 11). Lecture seule, sous `b2b_accounting`.
 */
@Controller("admin/accounting/collection-procedures")
@AdminSurface("b2b_accounting")
export class AdminCollectionProceduresController {
  constructor(private readonly queries: QueryBus) {}

  /** Ouvertes et à venir ; `includeClosed=true` ajoute les closes des trois derniers mois. */
  @Get()
  list(
    @Query("legalEntityId") legalEntityId: string,
    @Query("includeClosed") includeClosed: string | undefined,
  ): Promise<CollectionProcedureListView> {
    return this.queries.execute<ListCollectionProceduresQuery, CollectionProcedureListView>(
      new ListCollectionProceduresQuery(legalEntityId, includeClosed === "true"),
    );
  }
}
