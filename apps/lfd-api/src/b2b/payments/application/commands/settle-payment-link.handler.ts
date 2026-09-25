import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import type { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { SettlePaymentLinkCommand } from "./settle-payment-link.command.js";

/** Où l'équipe ouvre les liens libres (écran du lot 4). */
const PAYMENT_LINKS_SCREEN = "/comptabilite/liens-de-paiement";

/**
 * Passe un lien libre à `paid` sur confirmation de Stripe.
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
 * répond — même règle que `ConfirmOrderPaymentHandler`. Le fait reste lisible
 * sur la ligne (`paid_at`) et chez Stripe.
 */
@CommandHandler(SettlePaymentLinkCommand)
export class SettlePaymentLinkHandler implements ICommandHandler<SettlePaymentLinkCommand, void> {
  private readonly logger = new Logger(SettlePaymentLinkHandler.name);

  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(command: SettlePaymentLinkCommand): Promise<void> {
    const link = await this.links.loadBySession(command.sessionId);
    if (link === null) {
      this.logger.warn(`Paiement Stripe reçu pour une session inconnue (${command.sessionId}).`);
      return;
    }
    const settlement = link.markPaid(this.clock.now());
    if (settlement === "already_paid") {
      return;
    }
    await this.links.save(link);
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
      const companyName = (await this.companies.nameOf(link.companyId)) ?? link.companyId;
      await this.notifier.notify([
        {
          kind: "payment_link.paid_after_cancel",
          subject: `Lien annulé mais payé — ${companyName}`,
          body:
            `Le lien « ${link.terms.label} » avait été annulé, et le client l'a payé quand même. ` +
            "L'argent est encaissé : à rembourser ou à imputer.",
          link: PAYMENT_LINKS_SCREEN,
          idempotencyKey: `notification:payment_link.paid_after_cancel:${link.id}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche « lien annulé mais payé » non émise (lien ${link.id})`, error);
    }
  }
}
