import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { PaymentLinkBell, ringingOf } from "../payment-link-bell.js";
import { SettlePaymentLinkCommand } from "./settle-payment-link.command.js";

/**
 * Passe un lien libre **d'avant la porte** (canal `checkout`) à `paid` sur
 * confirmation de Stripe Checkout — par l'endpoint des liens ou par le relais
 * du webhook des cartes. Une demande de paiement libre payée par la porte est réglée par
 * son sujet `free_charge`, pas ici : elle n'a pas de session.
 *
 * **Idempotent** : Stripe réémet jusqu'à un 2xx, et un lien déjà payé ne
 * bouge plus (l'agrégat le dit). Une session inconnue ne fait rien — ce n'est
 * pas une de nos pages, ou sa ligne n'a jamais été écrite — et se journalise.
 *
 * 🔴 Un paiement sur un lien **annulé** le passe quand même à `paid`, et
 * sonne la cloche : l'équipe croit ce lien retiré, alors que le client a payé.
 * C'est elle qui décide quoi faire de l'argent — rembourser ou l'imputer.
 *
 * `@sans-journal` projection d'un événement Stripe, pas un acte dont un humain
 * répond — même règle que `RecordProviderEventHandler` (bloc `card-payment`,
 * depuis le lot P0.c2 du plan M2). Le fait reste lisible
 * sur la ligne (`paid_at`) et chez Stripe.
 */
@CommandHandler(SettlePaymentLinkCommand)
export class SettlePaymentLinkHandler implements ICommandHandler<SettlePaymentLinkCommand, void> {
  private readonly logger = new Logger(SettlePaymentLinkHandler.name);

  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly bell: PaymentLinkBell,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SettlePaymentLinkCommand): Promise<void> {
    // Sous le verrou de la ligne : une annulation qui croise ce paiement ne
    // l'efface pas, elle le voit et c'est « payé après annulation ».
    const outcome = await this.uow.run(async () => {
      const locked = await this.links.loadBySessionLocked(command.sessionId);
      if (locked === null) {
        return null;
      }
      const settled = locked.markPaid(this.clock.now());
      if (settled !== "already_paid") {
        await this.links.save(locked);
      }
      return { link: locked, settlement: settled };
    });
    if (outcome === null) {
      this.logger.warn(`Paiement Stripe reçu pour une session inconnue (${command.sessionId}).`);
      return;
    }
    const { link, settlement } = outcome;
    if (settlement === "settled_after_cancel") {
      await this.ringPaidAfterCancel(link);
    }
  }

  /**
   * Sonne sans faire échouer le webhook : le paiement est écrit. Un échec de la
   * cloche se journalise — le rejouer ferait réémettre Stripe pour rien.
   */
  private async ringPaidAfterCancel(link: PaymentLink): Promise<void> {
    try {
      await this.bell.paidAfterCancel(ringingOf(link));
    } catch (error) {
      this.logger.error(`Cloche « lien annulé mais payé » non émise (lien ${link.id})`, error);
    }
  }
}
