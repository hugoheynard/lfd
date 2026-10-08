import type { CardInvoiceRetryView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderToInvoiceNotFoundError } from "../../domain/errors/card-invoice-errors.js";
import { CardInvoiceOutcomes } from "../../domain/ports/card-invoice-outcomes.js";
import { CardInvoicingReader } from "../../domain/ports/card-invoicing.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { OrderInvoicingLock } from "../../domain/ports/order-invoicing-lock.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import { cardInvoiceVerdict } from "../../domain/services/card-invoicing.js";
import { prepareCardInvoice, type CardInvoicePreparation } from "../card-invoice-support.js";
import { InvoiceIssuer } from "../services/invoice-issuer.js";
import { RefundReconciler } from "../services/refund-reconciler.js";
import { IssueCardInvoiceCommand } from "./issue-card-invoice.command.js";

/**
 * **La facture carte d'une commande** (plan
 * `plan-facture-carte-et-remboursements.md`, § 2 bis, lot E5a).
 *
 * Sous le verrou de la commande : lire (« déjà facturée ? »), juger
 * (`cardInvoiceVerdict`), préparer — tout refus se juge AVANT le numéro
 * (`prepareCardInvoice`) — puis émettre par `InvoiceIssuer`, ranger l'issue,
 * et rapprocher les remboursements déjà notés (un remboursement partiel
 * d'avant le retrait devient son avoir aussitôt, § 2).
 *
 * 🔴 **Rien ne boucle** (§ 2 bis-6) : une facture impossible est SIGNALÉE —
 * rangée dans `card_invoice_outcome`, au journal — et le handler rend sans
 * lever. L'abonné durable qui l'appelle termine donc ; « Réessayer » rejoue.
 * Ce qui lève encore est une panne (base, assemblage), que la boîte d'envoi
 * réessaie et montre.
 *
 * Date d'émission : le jour local du `Clock` (§ 2 bis-2) — un rejeu après
 * minuit ne heurte pas `last_issued_on`. Le jour du retrait est la date de
 * livraison (BT-72).
 */
@CommandHandler(IssueCardInvoiceCommand)
export class IssueCardInvoiceHandler implements ICommandHandler<
  IssueCardInvoiceCommand,
  CardInvoiceRetryView
> {
  constructor(
    private readonly lock: OrderInvoicingLock,
    private readonly reader: CardInvoicingReader,
    private readonly creditors: CreditorReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly buyers: StatementBuyerReader,
    private readonly issuer: InvoiceIssuer,
    private readonly outcomes: CardInvoiceOutcomes,
    private readonly reconciler: RefundReconciler,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: IssueCardInvoiceCommand): Promise<CardInvoiceRetryView> {
    return this.uow.run(async () => {
      await this.lock.lock(command.orderId);
      const candidate = await this.reader.candidate(command.orderId);
      if (candidate === null) {
        throw new OrderToInvoiceNotFoundError(command.orderId);
      }
      const verdict = cardInvoiceVerdict(candidate);
      if (verdict !== "issuable") {
        if (verdict === "already_invoiced") {
          // Le rattrapage d'un rapprochement interrompu ne coûte rien.
          await this.reconciler.reconcile(command.orderId);
        }
        return { outcome: verdict, number: null, message: null };
      }
      const readers = { creditors: this.creditors, issuers: this.issuers, buyers: this.buyers };
      const prepared = await prepareCardInvoice(
        readers,
        candidate,
        this.ids.next(),
        this.clock.now(),
      );
      return prepared.kind === "blocked" ? this.signal(prepared) : this.issue(prepared);
    });
  }

  private async issue(
    prepared: Extract<CardInvoicePreparation, { kind: "ready" }>,
  ): Promise<CardInvoiceRetryView> {
    const invoice = await this.issuer.issue({
      legalEntityId: prepared.key.legalEntityId,
      issuedOn: prepared.issuedOn,
      draft: prepared.draft,
    });
    await this.outcomes.recordIssued(prepared.key, invoice.id);
    await this.reconciler.reconcile(prepared.key.orderId);
    return { outcome: "issued", number: invoice.number, message: null };
  }

  /** Rangée et journalisée — jamais levée. */
  private async signal(
    prepared: Extract<CardInvoicePreparation, { kind: "blocked" }>,
  ): Promise<CardInvoiceRetryView> {
    await this.outcomes.recordBlocked(prepared.key, prepared.message);
    await this.journal.append({
      type: "order.card_invoice_blocked",
      subjectType: "order",
      subjectId: prepared.key.orderId,
      payload: { subjectLabel: prepared.key.orderNumber, message: prepared.message },
    });
    return { outcome: "blocked", number: null, message: prepared.message };
  }
}
