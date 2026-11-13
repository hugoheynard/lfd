import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  NoShortfallRefundError,
  ShortfallRefundBlockedError,
} from "../../domain/errors/shortfall-refund-errors.js";
import { ShortfallRefunding } from "../services/shortfall-refunding.js";
import { RefundShortfallCommand } from "./refund-shortfall.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const REFUND_SHORTFALL_GESTURE = "orders.refund-shortfall";

/**
 * Le même jugement que l'abonné (`ShortfallRefunding`, phases 1 et 2), dans
 * SA propre unité de travail : une cause relue sous le verrou rend un 409
 * avec sa phrase, et rien n'est écrit — l'adoption du premier paiement est
 * annulée avec le refus. Une fois par intention : la clé est scellée dans la
 * même transaction que les demandes, et la même clé ne demande rien de plus.
 * Seconde défense, la vraie : rejoué avec une autre clé, le reste relu sous
 * le verrou retranche la demande ouverte, et vaut 0.
 */
@CommandHandler(RefundShortfallCommand)
export class RefundShortfallHandler implements ICommandHandler<RefundShortfallCommand, void> {
  constructor(
    private readonly refunding: ShortfallRefunding,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {OrderNotFoundError} commande inconnue.
   * @throws {ShortfallRefundBlockedError} une cause bloque encore.
   * @throws {NoShortfallRefundError} rien à rembourser.
   */
  execute(command: RefundShortfallCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REFUND_SHORTFALL_GESTURE,
        subject: intentSubject(command.orderId),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const judged = await this.refunding.judgeLocked(command.orderId);
          if (judged === null) {
            throw new OrderNotFoundError(command.orderId);
          }
          const { subject, verdict } = judged;
          if (verdict.kind === "blocked") {
            throw new ShortfallRefundBlockedError(subject.reference, verdict.cause);
          }
          if (verdict.kind === "none") {
            throw new NoShortfallRefundError(subject.reference);
          }
          await this.refunding.request(verdict, command.staffUserId);
          await seal();
        }),
    );
  }
}
