import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceSignalledEvent } from "../../domain/events/invoice-autopilot.events.js";
import {
  InvoicingFloorMissingError,
  InvoicingNotYetOpenError,
  NotABillingClosureError,
  PeriodNotYetInvoiceableError,
} from "../../domain/errors/monthly-invoice-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CancelledOrdersReader } from "../../domain/ports/cancelled-orders.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import {
  MonthlyInvoiceOutcomes,
  type MonthlyInvoiceOutcomeKey,
} from "../../domain/ports/monthly-invoice-outcomes.js";
import { MonthlyInvoicingReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { OrderBudgetCommitmentsReader } from "../../domain/ports/order-budget-commitments.reader.js";
import { OrderRowsLock } from "../../domain/ports/order-rows-lock.js";
import { PayerCommitmentRequirementsReader } from "../../domain/ports/payer-commitment-requirements.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayersCollectionMeansReader } from "../../domain/ports/payers-collection-means.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import type { BillingCycle } from "../../domain/services/billing-cycle.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import type { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import {
  invoicingMomentOf,
  parsePeriodClosure,
  periodLabelOf,
} from "../../domain/services/invoicing-closures.js";
import {
  ordersByPayer,
  planMonthlyInvoices,
  type PayerInvoicePlan,
} from "../../domain/services/monthly-invoicing.js";
import {
  splitForPeriodQuotes,
  type PeriodQuoteSplit,
} from "../../domain/services/period-quote-split.js";
import {
  draftOf,
  outcomeKey,
  payerPeriodLabelOf,
  report,
  type Issuance,
  type PayerIssue,
} from "../monthly-invoice-issuance.js";
import { closureIssuance, readIssuingParties } from "../closure-issuance.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { liveGroupUnderLock } from "../live-invoice-group.js";
import { unique } from "../unique-ids.js";
import { InvoiceIssuer } from "../services/invoice-issuer.js";
import { PeriodQuoteShelver } from "../services/period-quote-shelver.js";
import { IssueMonthlyInvoicesCommand } from "./issue-monthly-invoices.command.js";

/**
 * **La facture de la période** (plan `facture-emise.md` ; par clôture depuis
 * R3, par payeur depuis M2, `plan-rythme-de-facturation.md` §16.3).
 *
 * La clôture demandée est une clôture du CALENDRIER de l'entité
 * (`InvoicingCalendar` : celle d'au moins un payeur, ou du mensuel) ; un
 * instant qui n'en est pas une est refusé. Les bons lus vont du plancher à la
 * clôture, pour TOUS les payeurs — la lecture SQL ne connaît pas les modes ;
 * le tri se fait ensuite en mémoire : seul un payeur (`billedPayerOf`, sites
 * compris) dont la suite clôt à cet instant est facturé. Les bons des autres
 * attendent leur clôture. Un bon passé entre 23h55 et minuit la veille d'une
 * clôture déjà facturée est rattrapé par la suivante de son payeur.
 *
 * Pour chaque payeur légal qui clôt ici et a des bons passés au compte
 * avant la clôture et pas encore facturés : UNE facture 380 **par mandat
 * effectif** de ses bons (E4b, option b — une seule s'il n'en a qu'un, ou
 * aucun), calculée par
 * `simulateInvoiceDossier` puis `invoiceFromDossier`, numérotée et écrite
 * par `InvoiceIssuer` — **une transaction courte par payeur**, pour ne pas
 * tenir le compteur pendant toute la période des autres.
 *
 * - émise la **veille de la clôture** (jour local), échéance = la date de
 *   prélèvement du lot qui la prendra (`invoiceDueDay`) — sauf au virement :
 *   le jour d'émission plus le réglage de l'entité (`transferDueDay`, V6) ;
 * - moyen figé (BG-16) : le virement si SA période l'est (K10) ; sinon le
 *   mandat effectif, aucun pour la facture des bons sans mandat ;
 * - un refus (manque nommé, numérotation, base) : la facture n'est pas
 *   émise, le payeur est **signalé** — rangé dans `invoice_monthly_outcome`,
 *   journalisé (`invoice.signalled`, dans la transaction de l'issue) — et les
 *   autres continuent. Rien n'est avalé ;
 * - un bon non facturable est signalé et laissé hors de la facture ;
 * - un payeur public qui donne son numéro sur le devis (`on_period_quote`,
 *   plan `plan-clients-publics-chorus.md`, § 6 sexies) : ses groupes sans
 *   numéro sont RANGÉS dans un devis de période (`PeriodQuoteShelver`), pas
 *   facturés — aucune issue, le rapport les compte (`quoted`).
 *
 * ⚠️ L'échéance est celle du calendrier AU JOUR de l'émission : un lot
 * préparé tard (D4) prélève après elle ; la facture ne se réécrit pas.
 */
@CommandHandler(IssueMonthlyInvoicesCommand)
export class IssueMonthlyInvoicesHandler implements ICommandHandler<
  IssueMonthlyInvoicesCommand,
  MonthlyInvoiceReport
> {
  private readonly logger = new Logger(IssueMonthlyInvoicesHandler.name);

  constructor(
    private readonly reader: MonthlyInvoicingReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly creditors: CreditorReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly buyers: StatementBuyerReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly means: PayersCollectionMeansReader,
    private readonly issuer: InvoiceIssuer,
    private readonly outcomes: MonthlyInvoiceOutcomes,
    private readonly rows: OrderRowsLock,
    private readonly cancelled: CancelledOrdersReader,
    private readonly commitments: OrderBudgetCommitmentsReader,
    private readonly requirements: PayerCommitmentRequirementsReader,
    private readonly quotes: PeriodQuoteShelver,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: IssueMonthlyInvoicesCommand): Promise<MonthlyInvoiceReport> {
    const at = this.clock.now();
    const closesAt = parsePeriodClosure(command.periodClosesAt);
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      command.legalEntityId,
    );
    if (!calendar.isClosure(closesAt)) {
      throw new NotABillingClosureError(closesAt);
    }
    const period = calendar.periodOf(closesAt);
    const opensAt = invoicingMomentOf(closesAt);
    if (at.getTime() < opensAt.getTime()) {
      throw new PeriodNotYetInvoiceableError(periodLabelOf(period), opensAt);
    }
    const { plan, invoiced, issuance } = await this.prepare(
      command.legalEntityId,
      { period, calendar },
      at,
    );
    const issues: PayerIssue[] = [];
    for (const group of plan.toQuote) {
      issues.push(await this.quoteFor(group, issuance));
    }
    for (const invoice of plan.toIssue) {
      issues.push(await this.issueFor(invoice, issuance));
    }
    return report(issuance, issues, invoiced.size, plan.toIssue);
  }

  /** Tout ce qu'on lit avant la première facture — une fois pour tous les payeurs. */
  private async prepare(
    legalEntityId: string,
    { period, calendar }: { readonly period: BillingCycle; readonly calendar: InvoicingCalendar },
    at: Date,
  ): Promise<{
    readonly plan: PeriodQuoteSplit;
    readonly invoiced: ReadonlySet<string>;
    readonly issuance: Issuance;
  }> {
    const { creditors, issuers, reader, buyers, mandates, means, requirements } = this;
    const parties = await readIssuingParties({ creditors, issuers }, legalEntityId);
    const { closesAt } = period;
    const periodLabel = periodLabelOf(period);
    const floor = await this.openFloor(periodLabel, closesAt);
    const orders = await this.reader.uninvoicedOrders(floor, closesAt);
    const follows = await this.reader.billingFollowsOf(unique(orders.map((o) => o.companyId)));
    const invoiced = await this.reader.invoicedGroups(legalEntityId, closesAt);
    // Seuls les payeurs qui closent ici : les bons des autres attendent leur clôture.
    const payers = ordersByPayer(orders, follows).filter((payer) =>
      calendar.closesFor(payer.payerId, closesAt),
    );
    const issuance = await closureIssuance(
      { reader, buyers, mandates, means, requirements },
      parties,
      {
        legalEntityId,
        period,
        periodLabel,
        closures: calendar,
        payerPeriodOf: (payerId) => calendar.payerPeriodOf(payerId, closesAt),
        at,
      },
      payers,
      follows,
    );
    const { context } = issuance;
    const { invoices } = planMonthlyInvoices(payers, { legalEntityId, ...context }, invoiced);
    // Après le plan : les groupes n'existent qu'une fois faits (v5 B4).
    const plan = splitForPeriodQuotes(invoices, context.commitmentRequirements);
    return { plan, invoiced, issuance };
  }

  private async openFloor(periodLabel: string, closesAt: Date): Promise<Date> {
    const floor = await this.reader.invoicingFloor();
    if (floor === null) {
      throw new InvoicingFloorMissingError();
    }
    if (floor.getTime() >= closesAt.getTime()) {
      throw new InvoicingNotYetOpenError(periodLabel, floor);
    }
    return floor;
  }

  /**
   * Une facture (payeur × mandat) : elle et son issue ensemble, ou son refus
   * rangé.
   *
   * Dans la transaction et AVANT le numéro, le groupe est relu sous le
   * verrou de TOUS ses bons (`liveGroupUnderLock`) : une annulation qui
   * attend ce verrou relira une commande facturée.
   */
  private async issueFor(planned: PayerInvoicePlan, issuance: Issuance): Promise<PayerIssue> {
    const { payerId } = planned;
    let key = outcomeKey(planned, issuance);
    try {
      return await this.uow.run(async () => {
        const { rows, cancelled, commitments } = this;
        const payer = await liveGroupUnderLock({ rows, cancelled, commitments }, planned);
        if (payer === null) {
          return { kind: "void", payerCompanyId: payerId };
        }
        key = outcomeKey(payer, issuance);
        if (payer.billable.length === 0) {
          const message = `Aucun bon facturable sur la période ${payerPeriodLabelOf(payerId, issuance)} : ${key.unbillableOrders.join(", ")} (bon incohérent ou sans taux de TVA) — le signaler à l'équipe technique.`;
          return this.signal(key, message);
        }
        const invoice = await this.issuer.issue({
          legalEntityId: issuance.legalEntityId,
          issuedOn: issuance.issuedOn,
          draft: (reserved) => draftOf(payer, issuance, this.ids.next(), reserved),
        });
        await this.outcomes.recordIssued(key, invoice.id);
        return {
          kind: "issued",
          payerCompanyId: payerId,
          number: invoice.number,
          issuedOn: issuance.issuedOn,
        };
      });
    } catch (error) {
      this.warn(payerId, error);
      return this.signal(key, messageOf(error));
    }
  }

  /**
   * Le groupe rangé dans un devis de période (P2 bis) ; son refus est signalé
   * comme celui d'une facture, et les autres payeurs continuent.
   */
  private async quoteFor(planned: PayerInvoicePlan, issuance: Issuance): Promise<PayerIssue> {
    try {
      return await this.quotes.shelve(planned, issuance);
    } catch (error) {
      this.warn(planned.payerId, error);
      return this.signal(outcomeKey(planned, issuance), messageOf(error));
    }
  }

  private warn(payerId: string, error: unknown): void {
    this.logger.warn({ message: "monthly_invoice_blocked", payerId, reason: messageOf(error) });
  }

  /**
   * Le payeur signalé : son issue rangée et son fait au journal, ensemble. Le
   * même refus déjà rangé (une émission rejouée) ne se rejournalise pas.
   */
  private async signal(key: MonthlyInvoiceOutcomeKey, message: string): Promise<PayerIssue> {
    await this.uow.run(async () => {
      if (!(await this.outcomes.recordBlocked(key, message))) {
        return;
      }
      await this.events.publishTraced(
        new InvoiceSignalledEvent(
          { id: key.payerCompanyId, name: key.payerName },
          { startsAt: key.periodStartsAt, closesAt: key.periodClosesAt },
          message,
          key.at,
        ),
      );
    });
    return { kind: "blocked", payerCompanyId: key.payerCompanyId, message };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
