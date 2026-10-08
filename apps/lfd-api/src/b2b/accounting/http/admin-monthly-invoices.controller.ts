import type {
  IssueMonthlyInvoicesPayload,
  MonthlyInvoiceReportView,
  MonthlyInvoicesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { IssueMonthlyInvoicesCommand } from "../application/commands/issue-monthly-invoices.command.js";
import { GetMonthlyInvoicesQuery } from "../application/queries/get-monthly-invoices.query.js";
import type { MonthlyInvoiceReport } from "../domain/services/monthly-invoice-report.js";

/**
 * La FORME du bouton seulement : le mois existe-t-il, est-il passé, l'entité
 * facture-t-elle — c'est la commande qui le dit. Ici et pas dans
 * `@lfd/contracts` : une valeur de plus dans le paquet exécuté par les fronts
 * pour un seul lecteur.
 */
const issueMonthlyInvoicesPayloadSchema = z.strictObject({
  legalEntityId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/u),
});

/**
 * Surface **staff** de la facture du mois (plan `plan-emission-de-la-facture.md`,
 * lot E4) : `GET` lit, `POST` émet (`b2b_accounting:write`) — la même
 * commande que le passage automatique.
 */
@Controller("admin/accounting/monthly-invoices")
@AdminSurface("b2b_accounting")
export class AdminMonthlyInvoicesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  month(@Query("legalEntityId") legalEntityId: string): Promise<MonthlyInvoicesView> {
    return this.queries.execute<GetMonthlyInvoicesQuery, MonthlyInvoicesView>(
      new GetMonthlyInvoicesQuery(legalEntityId),
    );
  }

  /** « Émettre les factures de septembre ». Rejouable : une facture émise (payeur × mandat) ne l'est pas deux fois. */
  @Post()
  @HttpCode(200)
  issue(
    @Body(new ZodBody(issueMonthlyInvoicesPayloadSchema)) payload: IssueMonthlyInvoicesPayload,
  ): Promise<MonthlyInvoiceReportView> {
    return this.commands.execute<IssueMonthlyInvoicesCommand, MonthlyInvoiceReport>(
      new IssueMonthlyInvoicesCommand(payload.legalEntityId, payload.month),
    );
  }
}
