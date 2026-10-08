import { instantToLocal } from "@lfd/contracts";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CreditorSnapshot } from "../../domain/creditor-snapshot.js";
import { statementSellerOf } from "../../domain/entities/billing-statement.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import {
  InvoicingFloorMissingError,
  InvoicingNotYetOpenError,
  MonthNotYetInvoiceableError,
  NotTheInvoicingEntityError,
} from "../../domain/errors/monthly-invoice-errors.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import {
  MonthlyInvoiceOutcomes,
  type MonthlyInvoiceOutcomeKey,
} from "../../domain/ports/monthly-invoice-outcomes.js";
import { MonthlyInvoicingReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import { collectionDayOf } from "../../domain/services/collection-calendar.js";
import { invoiceFromDossier } from "../../domain/services/invoice-from-dossier.js";
import type { InvoiceSellerFacts } from "../../domain/services/invoice-issuance-blockers.js";
import { simulateInvoiceDossier } from "../../domain/services/invoice-dossier.js";
import type { MonthlyInvoiceReport } from "../../domain/services/monthly-invoice-report.js";
import {
  invoicePaymentMeansOf,
  invoicingMomentOf,
  lastDayOf,
  ordersByPayer,
  planMonthlyInvoices,
  type MonthlyInvoicePlan,
  type PayerInvoicePlan,
} from "../../domain/services/monthly-invoicing.js";
import { StatementMonth } from "../../domain/value-objects/statement-month.js";
import { readMonthlyContext, unique, type MonthlyContext } from "../monthly-invoice-support.js";
import { InvoiceIssuer } from "../services/invoice-issuer.js";
import { IssueMonthlyInvoicesCommand } from "./issue-monthly-invoices.command.js";

/** Ce qui ne change pas d'un payeur à l'autre dans un passage. */
interface Issuance {
  readonly legalEntityId: string;
  readonly month: StatementMonth;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly creditor: CreditorSnapshot;
  readonly sellerFacts: InvoiceSellerFacts;
  readonly context: MonthlyContext;
  readonly at: Date;
}

type PayerIssue =
  | {
      readonly kind: "issued";
      readonly payerCompanyId: string;
      readonly number: string;
      readonly issuedOn: string;
    }
  | { readonly kind: "blocked"; readonly payerCompanyId: string; readonly message: string };

/**
 * **La facture du mois** (plan `plan-emission-de-la-facture.md`, § 3, lot E4).
 *
 * Pour chaque payeur légal (`billedPayerOf`) qui a des bons passés au compte
 * dans le mois et pas encore facturés : UNE facture 380 **par mandat
 * effectif** de ses bons (E4b, option b — une seule s'il n'en a qu'un, ou
 * aucun), calculée par
 * `simulateInvoiceDossier` puis `invoiceFromDossier`, numérotée et écrite
 * par `InvoiceIssuer` — **une transaction courte par payeur**, pour ne pas
 * tenir le compteur pendant tout le mois des autres.
 *
 * - émise le **dernier jour du mois** (jour local), échéance = la date de
 *   prélèvement du calendrier (`collectionDayOf`) ;
 * - moyen de paiement figé : le mandat effectif de la facture (BG-16), aucun
 *   pour la facture des bons sans mandat ;
 * - un refus (manque nommé, numérotation, base) : la facture n'est pas
 *   émise, le payeur est **signalé** — rangé dans `invoice_monthly_outcome`,
 *   journalisé — et les autres continuent. Rien n'est avalé ;
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
    private readonly creditors: CreditorReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly buyers: StatementBuyerReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
    private readonly issuer: InvoiceIssuer,
    private readonly outcomes: MonthlyInvoiceOutcomes,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: IssueMonthlyInvoicesCommand): Promise<MonthlyInvoiceReport> {
    const at = this.clock.now();
    const month = StatementMonth.parse(command.month);
    const opensAt = invoicingMomentOf(month);
    if (at.getTime() < opensAt.getTime()) {
      throw new MonthNotYetInvoiceableError(month.toString(), opensAt);
    }
    const { plan, invoiced, issuance } = await this.prepare(command.legalEntityId, month, at);
    const issues: PayerIssue[] = [];
    for (const invoice of plan.invoices) {
      issues.push(await this.issueFor(invoice, issuance));
    }
    return report(month, issues, invoiced.size, plan.invoices);
  }

  /** Tout ce qu'on lit avant la première facture — une fois pour tous les payeurs. */
  private async prepare(
    legalEntityId: string,
    month: StatementMonth,
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
    const { closesAt } = month.cycle();
    const floor = await this.openFloor(month, closesAt);
    const orders = await this.reader.uninvoicedOrders(floor, closesAt);
    const follows = await this.reader.billingFollowsOf(unique(orders.map((o) => o.companyId)));
    const invoiced = await this.reader.invoicedGroups(legalEntityId, month.toString());
    const payers = ordersByPayer(orders, follows);
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
    // Jamais d'antidate : émise après le dernier jour, la facture porte le
    // jour réel (Paris) ; la période facturée reste le mois.
    const issuedOn = later(lastDayOf(month), instantToLocal(at).day);
    const issuance: Issuance = {
      legalEntityId,
      month,
      issuedOn,
      dueOn: later(
        issuedOn,
        collectionDayOf(closesAt, preNotificationDays, collectionDaysAfterClosure),
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

  private async openFloor(month: StatementMonth, closesAt: Date): Promise<Date> {
    const floor = await this.reader.invoicingFloor();
    if (floor === null) {
      throw new InvoicingFloorMissingError();
    }
    if (floor.getTime() >= closesAt.getTime()) {
      throw new InvoicingNotYetOpenError(month.toString(), floor);
    }
    return floor;
  }

  /** Une facture (payeur × mandat) : elle et son issue ensemble, ou son refus rangé. */
  private async issueFor(payer: PayerInvoicePlan, issuance: Issuance): Promise<PayerIssue> {
    const key = outcomeKey(payer, issuance);
    const { payerId } = payer;
    if (payer.billable.length === 0) {
      const message = `Aucun bon facturable ce mois-ci : ${key.unbillableOrders.join(", ")} (bon incohérent ou sans taux de TVA) — le signaler à l'équipe technique.`;
      await this.outcomes.recordBlocked(key, message);
      return { kind: "blocked", payerCompanyId: payerId, message };
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
      await this.outcomes.recordBlocked(key, message);
      return { kind: "blocked", payerCompanyId: payerId, message };
    }
  }
}

/** La facture d'un payeur, une fois son numéro réservé — rien n'y est recalculé. */
function draftOf(
  payer: PayerInvoicePlan,
  issuance: Issuance,
  id: string,
  number: Parameters<typeof invoiceFromDossier>[0]["number"],
): ReturnType<typeof invoiceFromDossier> {
  const { context } = issuance;
  return invoiceFromDossier({
    id,
    number,
    issuedOn: issuance.issuedOn,
    dueOn: issuance.dueOn,
    sellerFacts: issuance.sellerFacts,
    seller: statementSellerOf(issuance.creditor),
    buyer: context.buyers.get(payer.payerId) ?? null,
    // L'adresse de livraison n'est pas figée par bon : aucune n'est imprimée
    // plutôt qu'une parmi plusieurs (rapport du lot E4).
    deliveryAddressLines: null,
    orders: payer.billable.map((order) => ({
      orderId: order.orderId,
      reference: order.orderNumber,
      deliveredOn: context.deliveredOn.get(order.orderId) ?? null,
    })),
    paymentMeans: invoicePaymentMeansOf(payer.mandate),
    // Rien n'est payé d'avance sur un bon au compte : il sera prélevé.
    prepayment: null,
    computed: simulateInvoiceDossier(payer.billable.map((order) => order.frozen)).invoice,
  });
}

function outcomeKey(payer: PayerInvoicePlan, issuance: Issuance): MonthlyInvoiceOutcomeKey {
  return {
    legalEntityId: issuance.legalEntityId,
    month: issuance.month.toString(),
    payerCompanyId: payer.payerId,
    payerName: issuance.context.names.get(payer.payerId) ?? payer.payerId,
    mandateId: payer.mandate?.mandateId ?? null,
    mandateReference: payer.mandate?.reference ?? null,
    unbillableOrders: payer.unbillable.map((order) => order.orderNumber),
    at: issuance.at,
  };
}

function report(
  month: StatementMonth,
  issues: readonly PayerIssue[],
  alreadyInvoiced: number,
  invoices: readonly PayerInvoicePlan[],
): MonthlyInvoiceReport {
  return {
    month: month.toString(),
    issued: issues.flatMap((issue) =>
      issue.kind === "issued"
        ? [{ payerCompanyId: issue.payerCompanyId, number: issue.number, issuedOn: issue.issuedOn }]
        : [],
    ),
    blocked: issues.flatMap((issue) =>
      issue.kind === "blocked"
        ? [{ payerCompanyId: issue.payerCompanyId, message: issue.message }]
        : [],
    ),
    alreadyInvoiced,
    unbillableOrders: invoices.reduce((sum, invoice) => sum + invoice.unbillable.length, 0),
  };
}

/** Le plus tard de deux jours `AAAA-MM-JJ`. */
function later(left: string, right: string): string {
  return left >= right ? left : right;
}
