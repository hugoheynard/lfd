import { instantToLocal } from "@lfd/contracts";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceSignalledEvent } from "../../domain/events/invoice-autopilot.events.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import {
  InvoicingFloorMissingError,
  InvoicingNotYetOpenError,
  NotABillingClosureError,
  NotTheInvoicingEntityError,
  PeriodNotYetInvoiceableError,
} from "../../domain/errors/monthly-invoice-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import {
  MonthlyInvoiceOutcomes,
  type MonthlyInvoiceOutcomeKey,
} from "../../domain/ports/monthly-invoice-outcomes.js";
import { MonthlyInvoicingReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import type { BillingCycle } from "../../domain/services/billing-cycle.js";
import type { InvoiceSellerFacts } from "../../domain/services/invoice-issuance-blockers.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import { invoiceDueDay } from "../../domain/services/invoice-due-day.js";
import type { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import {
  invoicingMomentOf,
  lastDayOf,
  parsePeriodClosure,
  periodLabelOf,
} from "../../domain/services/invoicing-closures.js";
import {
  ordersByPayer,
  planMonthlyInvoices,
  type MonthlyInvoicePlan,
  type PayerInvoicePlan,
} from "../../domain/services/monthly-invoicing.js";
import {
  draftOf,
  later,
  outcomeKey,
  payerPeriodLabelOf,
  report,
  type Issuance,
  type PayerIssue,
} from "../monthly-invoice-issuance.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { readMonthlyContext, unique } from "../monthly-invoice-support.js";
import { InvoiceIssuer } from "../services/invoice-issuer.js";
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
 *   prélèvement du lot qui la prendra (`invoiceDueDay`) ;
 * - moyen de paiement figé : le mandat effectif de la facture (BG-16), aucun
 *   pour la facture des bons sans mandat ;
 * - un refus (manque nommé, numérotation, base) : la facture n'est pas
 *   émise, le payeur est **signalé** — rangé dans `invoice_monthly_outcome`,
 *   journalisé (`invoice.signalled`, dans la transaction de l'issue) — et les
 *   autres continuent. Rien n'est avalé ;
 * - un bon non facturable est signalé et laissé hors de la facture.
 *
 * ⚠️ L'échéance est celle du calendrier AU JOUR de l'émission : une
 * préparation tardive du lot (D4) peut prélever plus tard que la facture ne
 * l'annonce. La facture ne se réécrit pas pour autant.
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
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
    private readonly issuer: InvoiceIssuer,
    private readonly outcomes: MonthlyInvoiceOutcomes,
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
    for (const invoice of plan.invoices) {
      issues.push(await this.issueFor(invoice, issuance));
    }
    return report(issuance, issues, invoiced.size, plan.invoices);
  }

  /** Tout ce qu'on lit avant la première facture — une fois pour tous les payeurs. */
  private async prepare(
    legalEntityId: string,
    { period, calendar }: { readonly period: BillingCycle; readonly calendar: InvoicingCalendar },
    at: Date,
  ): Promise<{
    readonly plan: MonthlyInvoicePlan;
    readonly invoiced: ReadonlySet<string>;
    readonly issuance: Issuance;
  }> {
    const creditor = await this.creditors.snapshot(legalEntityId);
    if (creditor === null) {
      throw new LegalEntityNotFoundError(legalEntityId);
    }
    const sellerFacts = await this.soleSeller(legalEntityId);
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
    const readers = {
      reader: this.reader,
      buyers: this.buyers,
      mandates: this.mandates,
      handovers: this.handovers,
      deliveries: this.deliveries,
    };
    const context = await readMonthlyContext(readers, payers, follows, at);
    const plan = planMonthlyInvoices(payers, { legalEntityId, ...context }, invoiced);
    const { preNotificationDays, collectionDaysAfterClosure } = creditor;
    // Jamais d'antidate : émise après la veille de la clôture, la facture
    // porte le jour réel (Paris) ; la période facturée reste la même.
    const issuedOn = later(lastDayOf(closesAt), instantToLocal(at).day);
    const issuance: Issuance = {
      legalEntityId,
      period,
      periodLabel,
      calendar,
      issuedOn,
      dueOn: later(
        issuedOn,
        invoiceDueDay(closesAt, at, calendar, { preNotificationDays, collectionDaysAfterClosure }),
      ),
      creditor,
      sellerFacts,
      context,
      at,
    };
    return { plan, invoiced, issuance };
  }

  /** La seule entité en service, et c'est elle — comme le mandat (`soleIssuer`). */
  private async soleSeller(legalEntityId: string): Promise<InvoiceSellerFacts> {
    const active = await this.issuers.activeIssuers();
    const [sole, ...others] = active;
    if (sole === undefined || others.length > 0 || sole.legalEntityId !== legalEntityId) {
      throw new NotTheInvoicingEntityError(legalEntityId);
    }
    return sole;
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

  /** Une facture (payeur × mandat) : elle et son issue ensemble, ou son refus rangé. */
  private async issueFor(payer: PayerInvoicePlan, issuance: Issuance): Promise<PayerIssue> {
    const key = outcomeKey(payer, issuance);
    const { payerId } = payer;
    if (payer.billable.length === 0) {
      const message = `Aucun bon facturable sur la période ${payerPeriodLabelOf(payerId, issuance)} : ${key.unbillableOrders.join(", ")} (bon incohérent ou sans taux de TVA) — le signaler à l'équipe technique.`;
      return this.signal(key, message);
    }
    try {
      const number = await this.uow.run(async () => {
        const invoice = await this.issuer.issue({
          legalEntityId: issuance.legalEntityId,
          issuedOn: issuance.issuedOn,
          draft: (reserved) => draftOf(payer, issuance, this.ids.next(), reserved),
        });
        await this.outcomes.recordIssued(key, invoice.id);
        return invoice.number;
      });
      return { kind: "issued", payerCompanyId: payerId, number, issuedOn: issuance.issuedOn };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ message: "monthly_invoice_blocked", payerId, reason: message });
      return this.signal(key, message);
    }
  }

  /** Le payeur signalé : son issue rangée et son fait au journal, ensemble. */
  private async signal(key: MonthlyInvoiceOutcomeKey, message: string): Promise<PayerIssue> {
    await this.uow.run(async () => {
      await this.outcomes.recordBlocked(key, message);
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
