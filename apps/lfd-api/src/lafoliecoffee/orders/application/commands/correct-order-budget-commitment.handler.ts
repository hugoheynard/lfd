import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderBudgetCommitmentCorrectedEvent } from "../../domain/events/order-budget-commitment-corrected.event.js";
import { AccountOrderEngagementReader } from "../../domain/ports/account-order-engagement.js";
import { OrderBudgetCommitmentRepository } from "../../domain/ports/order-budget-commitment.repository.js";
import { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import { PRIVATE_PAYER } from "../../domain/services/budget-commitment-rule.js";
import type { BudgetCommitment } from "../../domain/value-objects/budget-commitment.js";
import { CorrectOrderBudgetCommitmentCommand } from "./correct-order-budget-commitment.command.js";

/**
 * **Corriger l'engagement budgétaire** (E3′) : sous le verrou de la ligne
 * `orders` — celui que prend l'émission de la facture —, relire ce que la
 * comptabilité a engagé, juger par l'agrégat avec l'exigence du payeur, puis
 * écrire et journaliser dans la même transaction. Rejoué, le même engagement
 * ne réécrit rien et ne journalise rien.
 *
 * @throws {OrderNotFoundError} commande inconnue.
 * @throws {BudgetCommitmentAlreadyInvoicedError} la commande est facturée ou engagée.
 */
@CommandHandler(CorrectOrderBudgetCommitmentCommand)
export class CorrectOrderBudgetCommitmentHandler implements ICommandHandler<
  CorrectOrderBudgetCommitmentCommand,
  void
> {
  constructor(
    private readonly commitments: OrderBudgetCommitmentRepository,
    private readonly engagement: AccountOrderEngagementReader,
    private readonly requirements: PayerCommitmentRequirements,
    private readonly durable: DurablePublisher,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectOrderBudgetCommitmentCommand): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.commitments.lock(command.orderId);
      if (order === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const payerId = order.payerCompanyId;
      const terms = payerId === null ? PRIVATE_PAYER : await this.requirements.of(payerId);
      const engagement = await this.engagement.engagementOf(order.orderId);
      if (!order.correct(command.budgetCommitment, terms, engagement)) {
        return;
      }
      await this.commitments.save(order);
      await this.durable.publish(
        new OrderBudgetCommitmentCorrectedEvent(
          this.ids.next(),
          order.orderId,
          order.orderNumber,
          order.placedByUserId,
          command.staffUserId,
          factOf(order.before),
          factOf(order.pendingCommitment ?? null),
        ).durableFact(),
      );
    });
  }
}

function factOf(
  commitment: BudgetCommitment | null,
): { readonly number: string; readonly serviceCode: string } | null {
  return commitment === null
    ? null
    : { number: commitment.number, serviceCode: commitment.serviceCode };
}
