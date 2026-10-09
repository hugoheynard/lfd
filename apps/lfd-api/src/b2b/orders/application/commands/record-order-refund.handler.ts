import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderRefundLedger } from "../../domain/entities/order-refund-ledger.js";
import { RefundRejectedError } from "../../domain/errors/order-refund-errors.js";
import { OrderRefundSucceededFact } from "../../domain/events/order-refund-succeeded.fact.js";
import { OrderRefundRejectedEvent } from "../../domain/events/order-refund-rejected.event.js";
import { RefundWithoutOrderEvent } from "../../domain/events/refund-without-order.event.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import { recordedFacts, rejectedFact } from "../services/order-refund-facts.js";
import { RecordOrderRefundCommand } from "./record-order-refund.command.js";

/** Ce que le constat a donné — les suites qui se jouent APRÈS la transaction. */
type Outcome =
  | { readonly kind: "done" }
  | { readonly kind: "unmatched" }
  | { readonly kind: "rejected"; readonly event: OrderRefundRejectedEvent };

/**
 * **Constate un remboursement Stripe** sur sa commande (plan
 * `documentation/comptabilite/facturation/facture-carte-et-remboursements.md`).
 *
 * Charger le carnet sous verrou → `ledger.record()` → `save` → journal, dans
 * une seule unité de travail : la trace part avec l'écriture, ou rien ne part.
 * L'agrégat décide de tout — idempotence, statut qui ne régresse pas, devise,
 * plafond, bascule du règlement ; ce handler n'a aucune règle.
 *
 * Trois issues, et AUCUNE ne lève vers Stripe (un 4xx/5xx le ferait réessayer
 * trois jours sans que la réponse change) :
 *
 * Un remboursement qui PASSE à `succeeded` écrit aussi le fait durable
 * `order.refund_succeeded`, dans la même transaction : la comptabilité en tire
 * l'avoir (lot E5b).
 *
 * - constaté, ou périmé (webhook rejoué, ou arrivé dans le désordre) ;
 * - **refusé** : rien n'est écrit sur la commande, le refus va au journal, et
 *   `OrderRefundRejectedEvent` fait sonner la cloche — jamais une écriture
 *   fausse, jamais un silence ;
 * - **sans commande** : l'intention n'est à aucune commande (un lien libre) —
 *   `RefundWithoutOrderEvent`, que les paiements notent et font sonner.
 *
 * ⚠️ Pas de `publishTraced` : c'est la projection d'un événement Stripe, pas
 * un acte dont un humain répond (même règle que `ConfirmOrderPaymentHandler`).
 * Le journal s'écrit par `Journal.append`, parce que la trace d'un argent
 * rendu doit, elle, être opposable.
 */
@CommandHandler(RecordOrderRefundCommand)
export class RecordOrderRefundHandler implements ICommandHandler<RecordOrderRefundCommand, void> {
  constructor(
    private readonly refunds: OrderRefundRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: RecordOrderRefundCommand): Promise<void> {
    const outcome = await this.unitOfWork.run(() => this.record(command));
    if (outcome.kind === "unmatched") {
      this.events.publish(new RefundWithoutOrderEvent(command.report));
    }
    if (outcome.kind === "rejected") {
      this.events.publish(outcome.event);
    }
  }

  private async record(command: RecordOrderRefundCommand): Promise<Outcome> {
    const ledger = await this.refunds.loadByPaymentIntent(command.paymentIntentId);
    if (ledger === null) {
      return { kind: "unmatched" };
    }
    try {
      const recorded = ledger.record(command.report, this.ids.next(), this.clock.now());
      if (recorded.kind === "recorded") {
        await this.refunds.save(ledger);
        for (const fact of recordedFacts(ledger, recorded)) {
          await this.journal.append(fact);
        }
        if (recorded.refund.status === "succeeded") {
          // L'avoir (E5b) : la comptabilité l'émet sur ce fait, s'il y a
          // une facture carte à corriger.
          const fact = new OrderRefundSucceededFact(ledger.orderId, recorded.refund.id);
          await this.durable.publish(fact.durableFact());
        }
      }
      return { kind: "done" };
    } catch (error) {
      if (!(error instanceof RefundRejectedError)) {
        throw error;
      }
      return this.reject(ledger, command, error);
    }
  }

  /** Le refus se TRACE : le journal d'abord, la cloche après la transaction. */
  private async reject(
    ledger: OrderRefundLedger,
    command: RecordOrderRefundCommand,
    error: RefundRejectedError,
  ): Promise<Outcome> {
    await this.journal.append(rejectedFact(ledger, command.report, error.reason));
    return {
      kind: "rejected",
      event: new OrderRefundRejectedEvent(
        ledger.orderId,
        ledger.orderNumber,
        command.report.stripeRefundId,
        command.report.amountCents,
        error.reason,
      ),
    };
  }
}
