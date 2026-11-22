import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PayLinks } from "../../../../payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkNotFoundError } from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkCancelledFact } from "../../domain/events/payment-link-cancelled.fact.js";
import { PaymentLinkCancelledEvent } from "../../domain/events/payment-link.events.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { freeChargeSubject } from "../free-charge/free-charge-subject.js";
import { CancelPaymentLinkCommand } from "./cancel-payment-link.command.js";

/** Le motif de révocation du lien d'une demande de paiement libre annulée. */
const CANCELLED_REASON = "cancelled";

/**
 * Annule un lien libre. Sous le verrou de sa ligne (`loadLocked`, le même que
 * le sujet `free_charge` prend à l'encaissement), une annulation et un
 * paiement qui se croisent se jouent l'un après l'autre.
 *
 * **Une demande de paiement libre payée par la porte** (canal `door`) : dans la même
 * transaction, son lien est révoqué — la page rend 404 — et le fait durable
 * `payment_link.cancelled` est écrit ; son abonné annule l'intention chez le
 * prestataire, rejoué tant qu'il échoue. Aucun réseau ici.
 *
 * **Un lien d'avant la porte** (canal `checkout`) n'a plus de chemin de
 * règlement : s'il était relu encore ouvert, l'annulation ne fait que clore
 * sa ligne — sans appeler Stripe, sans révoquer ni écrire de fait durable.
 * Sa session Stripe a vécu ses 24 heures, rien ne peut plus la payer.
 */
@CommandHandler(CancelPaymentLinkCommand)
export class CancelPaymentLinkHandler implements ICommandHandler<CancelPaymentLinkCommand, void> {
  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly payLinks: PayLinks,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelPaymentLinkCommand): Promise<void> {
    await this.uow.run(async () => {
      const locked = await this.links.loadLocked(command.paymentLinkId);
      if (locked === null) {
        throw new PaymentLinkNotFoundError(command.paymentLinkId);
      }
      locked.cancel(this.clock.now(), command.staffUserId);
      // La société existe : la clé étrangère le garantit. L'id en repli ne sert
      // qu'à ne jamais écrire un sujet vide si la lecture échouait à la nommer.
      const companyName = (await this.companies.nameOf(locked.companyId)) ?? locked.companyId;
      await this.links.save(locked);
      if (locked.channel.kind === "door") {
        await this.withdrawDoor(locked);
      }
      await this.events.publishTraced(new PaymentLinkCancelledEvent(locked, companyName));
    });
  }

  private async withdrawDoor(link: PaymentLink): Promise<void> {
    await this.payLinks.revoke(freeChargeSubject(link.id), CANCELLED_REASON);
    await this.durable.publish(new PaymentLinkCancelledFact(link.id).durableFact());
  }
}
