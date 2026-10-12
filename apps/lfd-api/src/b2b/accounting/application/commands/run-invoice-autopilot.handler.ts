import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  InvoiceAutopilotRanEvent,
  type InvoiceAutopilotIssue,
} from "../../domain/events/invoice-autopilot.events.js";
import { InvoicingNotYetOpenError } from "../../domain/errors/monthly-invoice-errors.js";
import { AutomaticMonthlyInvoicer } from "../../domain/ports/automatic-monthly-invoicer.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { InvoiceAutopilotRuns } from "../../domain/ports/invoice-autopilot-runs.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { InvoicingFloorReader } from "../../domain/ports/invoicing-floor.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { periodMonthOf } from "../../domain/services/invoicing-closures.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import {
  RunInvoiceAutopilotCommand,
  type InvoiceAutopilotReport,
  type InvoiceAutopilotRunReport,
} from "./run-invoice-autopilot.command.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";

/** L'entité émettrice telle que le passage la nomme au journal. */
interface Issuer {
  readonly legalEntityId: string;
  readonly name: string;
}

/**
 * **Le passage automatique de la facture par période** (lot E4 ; par clôture
 * depuis R3, `plan-rythme-de-facturation.md` §9 et §10).
 *
 * Pour chaque entité émettrice en service : les clôtures de SON calendrier
 * (M2 : celles d'au moins un payeur, ou du mensuel — `InvoicingCalendar`) dont
 * la veille à 23h55 est passée et qui n'ont jamais été tentées — la dernière,
 * et toutes celles manquées depuis la dernière tentée (ou depuis le
 * plancher), de la plus ancienne à la plus récente. Pour chacune, UNE
 * tentative — la même commande que le bouton, sous l'acteur système. Son
 * issue est rangée (`invoice_autopilot_run`) et journalisée
 * (`invoice.autopilot_ran`) dans la même transaction, comme le prélèvement.
 *
 * Pas gardé par « préparer le lot tout seul » : la facture est une
 * obligation, le prélèvement un choix (rapport du lot E4). Le passage se tait
 * sur une clôture déjà tentée, et ne retente jamais : le bouton reste ouvert
 * pour reprendre les payeurs signalés.
 */
@CommandHandler(RunInvoiceAutopilotCommand)
export class RunInvoiceAutopilotHandler implements ICommandHandler<
  RunInvoiceAutopilotCommand,
  InvoiceAutopilotReport
> {
  private readonly logger = new Logger(RunInvoiceAutopilotHandler.name);

  constructor(
    private readonly issuers: InvoiceIssuersReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly floors: InvoicingFloorReader,
    private readonly runs: InvoiceAutopilotRuns,
    private readonly invoicer: AutomaticMonthlyInvoicer,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<InvoiceAutopilotReport> {
    const now = this.clock.now();
    const floor = await this.floors.floor();
    const reports: InvoiceAutopilotRunReport[] = [];
    for (const issuer of await this.issuers.activeIssuers()) {
      for (const closesAt of await this.closuresOf(issuer.legalEntityId, now, floor)) {
        const report = await this.tryClosure(issuer, closesAt, now);
        if (report !== null) {
          reports.push(report);
        }
      }
    }
    return { runs: reports };
  }

  /** Les clôtures à tenter : depuis la dernière tentée, ou le plancher, le plus tard des deux. */
  private async closuresOf(
    legalEntityId: string,
    now: Date,
    floor: Date | null,
  ): Promise<readonly Date[]> {
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      legalEntityId,
    );
    const last = await this.runs.lastAttempted(legalEntityId);
    return calendar.closuresToAttempt(now, latest(last, floor));
  }

  /** Une clôture : tentée une fois, son issue rangée et journalisée ensemble. */
  private async tryClosure(
    { legalEntityId, name }: Issuer,
    closesAt: Date,
    now: Date,
  ): Promise<InvoiceAutopilotRunReport | null> {
    if (await this.runs.attempted(legalEntityId, closesAt)) {
      return null;
    }
    // La trace d'abord : c'est l'insertion qui décide qui tente.
    if (!(await this.runs.claim(legalEntityId, closesAt, now))) {
      return null;
    }
    const issue = await this.attempt(legalEntityId, closesAt);
    await this.uow.run(async () => {
      await this.runs.settle(legalEntityId, closesAt, issue.outcome, issue.message);
      await this.events.publishTraced(
        new InvoiceAutopilotRanEvent(
          { id: legalEntityId, name },
          periodMonthOf(closesAt),
          issue,
          now,
        ),
      );
    });
    return { legalEntityId, periodClosesAt: closesAt.toISOString(), outcome: issue.outcome };
  }

  private async attempt(legalEntityId: string, closesAt: Date): Promise<InvoiceAutopilotIssue> {
    try {
      return issueOf(await this.invoicer.issue(legalEntityId, closesAt));
    } catch (error) {
      if (error instanceof InvoicingNotYetOpenError) {
        return { ...NOTHING_DONE, outcome: "not_yet_open", message: error.message };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ message: "invoice_autopilot_failed", legalEntityId, error: message });
      return { ...NOTHING_DONE, outcome: "failed", message };
    }
  }
}

/** Un passage qui n'a rien émis ni signalé : le refus est venu avant le premier payeur. */
const NOTHING_DONE = { issuedCount: 0, signalledCount: 0 } as const;

/** Le plus tard de deux instants, l'un ou l'autre pouvant manquer. */
function latest(left: Date | null, right: Date | null): Date | null {
  if (left === null || right === null) {
    return left ?? right;
  }
  return left.getTime() >= right.getTime() ? left : right;
}

/** Le rapport d'un passage réussi, dit en une issue, deux nombres et une phrase. */
function issueOf(report: MonthlyInvoiceReport): InvoiceAutopilotIssue {
  const counts = { issuedCount: report.issued.length, signalledCount: report.blocked.length };
  const signaled =
    report.blocked.length === 0 ? null : `${String(report.blocked.length)} payeur(s) signalé(s)`;
  if (report.issued.length > 0) {
    return { ...counts, outcome: "issued", message: signaled };
  }
  return {
    ...counts,
    outcome: "nothing_to_invoice",
    message: signaled ?? "Aucun bon à facturer pour cette période.",
  };
}
