import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OrderInvoicingLock } from "../../domain/ports/order-invoicing-lock.js";
import { RefundReconciler } from "../services/refund-reconciler.js";
import { ReconcileRefundsCommand } from "./reconcile-refunds.command.js";

/**
 * **Le rapprochement d'une commande** (plan
 * `plan-facture-carte-et-remboursements.md`, § 2 bis-7, lot E5b) : sous le
 * verrou de la commande — deux remboursements constatés ensemble ne lisent
 * pas tous deux « sans avoir » — puis `RefundReconciler`.
 *
 * @returns le nombre d'avoirs émis.
 */
@CommandHandler(ReconcileRefundsCommand)
export class ReconcileRefundsHandler implements ICommandHandler<ReconcileRefundsCommand, number> {
  constructor(
    private readonly lock: OrderInvoicingLock,
    private readonly reconciler: RefundReconciler,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: ReconcileRefundsCommand): Promise<number> {
    return this.uow.run(async () => {
      await this.lock.lock(command.orderId);
      return this.reconciler.reconcile(command.orderId);
    });
  }
}
