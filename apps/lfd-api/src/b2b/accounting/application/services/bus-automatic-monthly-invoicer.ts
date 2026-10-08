import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { Actor } from "../../../../platform/context/request-context.js";
import {
  currentRequestContext,
  runWithRequestContext,
} from "../../../../platform/context/request-context.store.js";
import { newTraceId } from "../../../../platform/context/trace-context.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AutomaticMonthlyInvoicer } from "../../domain/ports/automatic-monthly-invoicer.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import { IssueMonthlyInvoicesCommand } from "../commands/issue-monthly-invoices.command.js";

/** L'acteur de la facture du mois automatique (E4) : le système, nommé. */
export const INVOICE_AUTOPILOT_ACTOR: Actor = { type: "system", id: "invoice-autopilot" };

/**
 * La VRAIE facture du mois, par le bus, dans un contexte de requête dont
 * l'acteur est {@link INVOICE_AUTOPILOT_ACTOR} : les faits `invoice.issued`
 * l'écrivent. Même mécanique que `BusAutomaticCollectionConstituter`.
 */
@Injectable()
export class BusAutomaticMonthlyInvoicer extends AutomaticMonthlyInvoicer {
  constructor(
    private readonly commands: CommandBus,
    private readonly clock: Clock,
  ) {
    super();
  }

  issue(legalEntityId: string, month: string): Promise<MonthlyInvoiceReport> {
    const seed = {
      now: this.clock.now(),
      traceId: currentRequestContext()?.traceId ?? newTraceId(),
      actor: INVOICE_AUTOPILOT_ACTOR,
    };
    return runWithRequestContext(seed, () =>
      this.commands.execute<IssueMonthlyInvoicesCommand, MonthlyInvoiceReport>(
        new IssueMonthlyInvoicesCommand(legalEntityId, month),
      ),
    );
  }
}
