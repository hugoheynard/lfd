import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoicingNotYetOpenError } from "../../domain/errors/monthly-invoice-errors.js";
import { AutomaticMonthlyInvoicer } from "../../domain/ports/automatic-monthly-invoicer.js";
import {
  InvoiceAutopilotRuns,
  type SettledInvoiceAutopilotOutcome,
} from "../../domain/ports/invoice-autopilot-runs.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import { monthToInvoice } from "../../domain/services/monthly-invoicing.js";
import {
  RunInvoiceAutopilotCommand,
  type InvoiceAutopilotReport,
  type InvoiceAutopilotRunReport,
} from "./run-invoice-autopilot.command.js";

interface Issue {
  readonly outcome: SettledInvoiceAutopilotOutcome;
  readonly message: string | null;
}

/**
 * **Le passage automatique de la facture du mois** (lot E4).
 *
 * Pour chaque entité émettrice en service : le mois à facturer à cet instant
 * (le dernier dont le « dernier jour, 22h » est passé). S'il n'a jamais été
 * tenté, UNE tentative — la même commande que le bouton, sous l'acteur
 * système. Son issue est rangée (`invoice_autopilot_run`).
 *
 * Pas gardé par « préparer le lot tout seul » : la facture est une
 * obligation, le prélèvement un choix (rapport du lot E4). Comme celui du
 * lot, le passage se tait sur un mois déjà tenté, et ne retente jamais : le
 * bouton reste ouvert pour reprendre les payeurs signalés.
 */
@CommandHandler(RunInvoiceAutopilotCommand)
export class RunInvoiceAutopilotHandler implements ICommandHandler<
  RunInvoiceAutopilotCommand,
  InvoiceAutopilotReport
> {
  private readonly logger = new Logger(RunInvoiceAutopilotHandler.name);

  constructor(
    private readonly issuers: InvoiceIssuersReader,
    private readonly runs: InvoiceAutopilotRuns,
    private readonly invoicer: AutomaticMonthlyInvoicer,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<InvoiceAutopilotReport> {
    const now = this.clock.now();
    const month = monthToInvoice(now).toString();
    const reports: InvoiceAutopilotRunReport[] = [];
    for (const { legalEntityId } of await this.issuers.activeIssuers()) {
      if (await this.runs.attempted(legalEntityId, month)) {
        continue;
      }
      // La trace d'abord : c'est l'insertion qui décide qui tente.
      if (!(await this.runs.claim(legalEntityId, month, now))) {
        continue;
      }
      const issue = await this.attempt(legalEntityId, month);
      await this.runs.settle(legalEntityId, month, issue.outcome, issue.message);
      reports.push({ legalEntityId, month, outcome: issue.outcome });
    }
    return { runs: reports };
  }

  private async attempt(legalEntityId: string, month: string): Promise<Issue> {
    try {
      return issueOf(await this.invoicer.issue(legalEntityId, month));
    } catch (error) {
      if (error instanceof InvoicingNotYetOpenError) {
        return { outcome: "not_yet_open", message: error.message };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ message: "invoice_autopilot_failed", legalEntityId, error: message });
      return { outcome: "failed", message };
    }
  }
}

/** Le rapport d'un passage réussi, dit en une issue et une phrase. */
function issueOf(report: MonthlyInvoiceReport): Issue {
  const signaled =
    report.blocked.length === 0 ? null : `${String(report.blocked.length)} payeur(s) signalé(s)`;
  if (report.issued.length > 0) {
    return { outcome: "issued", message: signaled };
  }
  return {
    outcome: "nothing_to_invoice",
    message: signaled ?? "Aucun bon à facturer pour ce mois.",
  };
}
