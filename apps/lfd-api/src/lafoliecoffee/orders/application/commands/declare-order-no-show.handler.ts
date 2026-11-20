import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderNoShowFact } from "../../domain/events/order-no-show.fact.js";
import { OrderNoShowRepository } from "../../domain/ports/order-no-show.repository.js";
import { DeclareOrderNoShowCommand } from "./declare-order-no-show.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const DECLARE_NO_SHOW_GESTURE = "orders.declare-no-show";

/**
 * **« Le client n'est pas venu »** (`plan-commande-particulier-reglee-en-boutique.md`,
 * § 5 bis).
 *
 * Une transaction : la commande verrouillée — le verrou que le retrait prend
 * avant d'attester —, le retrait relu sous lui chez son propriétaire, l'agrégat
 * qui juge (à régler en boutique, ouverte, créneau fini), puis le statut
 * `no_show`, le fait durable `order.no_show` (le journal) et le sceau de
 * l'intention. Aucun e-mail : prévenir le client est un geste distinct, décidé
 * par la supervision.
 *
 * Une fois par intention : un double clic rend le même succès ; un second geste
 * sur une commande déjà déclarée est un 409 qui le dit.
 *
 * @throws {OrderNotFoundError} et les refus de `OrderNoShow.declare`.
 */
@CommandHandler(DeclareOrderNoShowCommand)
export class DeclareOrderNoShowHandler implements ICommandHandler<DeclareOrderNoShowCommand, void> {
  constructor(
    private readonly noShows: OrderNoShowRepository,
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly durable: DurablePublisher,
    private readonly intents: OncePerIntent,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: DeclareOrderNoShowCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: DECLARE_NO_SHOW_GESTURE,
        subject: intentSubject(command.orderId),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private declare(
    command: DeclareOrderNoShowCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    return this.uow.run(async () => {
      const locked = await this.noShows.lock(command.orderId);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const { noShow } = locked;
      const attested = (await this.handovers.ofOrders([command.orderId])).has(command.orderId);
      const at = this.clock.now();
      noShow.declare(at, command.staffUserId, attested);
      await this.noShows.save(noShow);
      await this.durable.publish(
        new OrderNoShowFact(
          noShow.orderId,
          noShow.reference,
          locked.placedByUserId,
          command.staffUserId,
          at,
        ).durableFact(),
      );
      await seal(undefined);
    });
  }
}
