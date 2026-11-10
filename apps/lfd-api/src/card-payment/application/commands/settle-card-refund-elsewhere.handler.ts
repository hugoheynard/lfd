import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  CardRefundNothingLeftError,
  CardRefundRequestNotFoundError,
} from "../../domain/errors/card-refund-errors.js";
import { CardRefundLedgerRepository } from "../../domain/ports/card-refund-ledger.repository.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import { CardRefundEffectsWriter, RefundEffects } from "../refunds/card-refund-effects.js";
import { settledElsewhereFact } from "../refunds/card-refund-journal.js";
import { CardRefundScope } from "../refunds/card-refund-scope.js";
import { SettleCardRefundElsewhereCommand } from "./settle-card-refund-elsewhere.command.js";

/**
 * **« Rendu autrement »** (plan M2, §5.5) — sous l'ordre du §3.6 : le sujet,
 * le paiement et son carnet, la demande relue. L'agrégat refuse ce qui n'est
 * pas arrêté ; le carnet reçoit une ligne `manual`, `succeeded`, du montant de
 * la demande (`amount`) ou du reste du paiement (`remainder`) ; puis le
 * journal (`card_payment.settled_elsewhere`), `card_payment.refund_succeeded`,
 * et le canal `settled_elsewhere` — par lequel le sujet publie
 * `order.refund_succeeded`, et l'avoir se décide comme pour un `re_…`.
 */
@CommandHandler(SettleCardRefundElsewhereCommand)
export class SettleCardRefundElsewhereHandler implements ICommandHandler<
  SettleCardRefundElsewhereCommand,
  void
> {
  constructor(
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly ledgers: CardRefundLedgerRepository,
    private readonly effects: CardRefundEffectsWriter,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {CardRefundRequestNotFoundError} demande inconnue.
   * @throws {CardRefundNotStoppedError} la demande n'est pas arrêtée.
   * @throws {CardRefundNothingLeftError} le paiement n'a plus rien à rendre.
   */
  execute(command: SettleCardRefundElsewhereCommand): Promise<void> {
    return this.uow.run(async () => {
      const paymentId = await this.requests.paymentOf(command.requestId);
      const locked = paymentId === null ? null : await this.scope.lock(paymentId);
      const request = locked === null ? null : await this.requests.load(command.requestId);
      if (locked === null || request === null) {
        throw new CardRefundRequestNotFoundError(command.requestId);
      }
      request.settleElsewhere(command.staffId, command.reason);
      const { form, amountCents, nature } = request.view;
      const settled = form === "amount" ? (amountCents ?? 0) : locked.ledger.remainderCents();
      if (settled <= 0) {
        throw new CardRefundNothingLeftError(request.paymentId);
      }
      const line = locked.ledger.recordManual(
        { requestId: request.id, nature },
        settled,
        this.ids.next(),
        this.clock.now(),
      );
      await this.ledgers.save(locked.ledger);
      await this.requests.save(request);
      const effects = new RefundEffects();
      effects.journal((label) => settledElsewhereFact(request, label, settled));
      effects.outcome({
        kind: "settled_elsewhere",
        requestId: request.id,
        refundId: line.id,
        amountCents: settled,
        staffId: command.staffId,
        reason: request.view.settledReason ?? command.reason,
      });
      await this.effects.flush(locked, effects);
    });
  }
}
