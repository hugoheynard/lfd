import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CustomerCancellationRefusedError } from "../../domain/errors/customer-cancellation-errors.js";
import { CustomerCancellationReason } from "../../domain/value-objects/customer-cancellation-reason.js";
import { CustomerOrderCancellation } from "../services/customer-order-cancellation.js";
import { GuestCancellationLinkResolver } from "../services/guest-cancellation-link.resolver.js";
import { CancelGuestOrderCommand } from "./cancel-guest-order.command.js";

/**
 * **L'annulation par l'invité** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.4,
 * C6.6) : le lien vérifié (`404` neutre sinon), puis — S3 — une fiche devenue
 * un compte connectable passe par sa session, une fiche désactivée par la
 * boutique ; enfin P1/P2 et le noyau staff, l'auteur étant `guest`.
 */
@CommandHandler(CancelGuestOrderCommand)
export class CancelGuestOrderHandler implements ICommandHandler<CancelGuestOrderCommand, void> {
  constructor(
    private readonly links: GuestCancellationLinkResolver,
    private readonly cancellation: CustomerOrderCancellation,
    private readonly clock: Clock,
  ) {}

  async execute(command: CancelGuestOrderCommand): Promise<void> {
    const reason = CustomerCancellationReason.of(command.reasonCode, command.reasonText);
    const now = this.clock.now();
    const subject = await this.links.resolve(command.orderId, command.token, now);
    if (!subject.buyer.active) {
      throw new CustomerCancellationRefusedError("account_disabled");
    }
    if (subject.buyer.hasAccount) {
      throw new CustomerCancellationRefusedError("account_required");
    }
    await this.cancellation.cancel({
      subject,
      actor: { kind: "guest", userId: subject.placedByUserId },
      reason,
      now,
    });
  }
}
