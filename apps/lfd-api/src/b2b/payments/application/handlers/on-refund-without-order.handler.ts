import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { RefundWithoutOrderEvent } from "../../../orders/domain/events/refund-without-order.event.js";

/** Où l'équipe ouvre les liens libres. */
const PAYMENT_LINKS_SCREEN = "/comptabilite/liens-de-paiement";

/**
 * **Un remboursement Stripe sur un paiement qu'aucune commande ne porte** —
 * un lien libre, le plus souvent (arbitrage A11 du plan
 * `facture-carte-et-remboursements.md`) : noté au journal, la cloche
 * sonne, et rien d'autre. Pas d'avoir automatique, pas de table : un lien peut
 * solder un impayé déjà facturé au mois, et l'avoir dépend de ce qu'il
 * réglait — c'est un geste humain.
 *
 * Le lien n'est pas retrouvé par son intention : la table des liens ne garde
 * que la session (`cs_…`), et l'événement de remboursement ne porte que
 * l'intention (vérifié le 2026-10-08). La cloche mène donc à la liste.
 *
 * Ni l'un ni l'autre ne fait échouer le webhook, qui a déjà répondu ; un échec
 * se journalise dans les logs. Le fait du journal n'a pas de clé propre : un
 * `refund.created` puis un `refund.updated` pour le même remboursement font
 * deux lignes, chacune avec son statut. La cloche, elle, dédoublonne par
 * remboursement.
 */
@EventsHandler(RefundWithoutOrderEvent)
export class OnRefundWithoutOrder implements IEventHandler<RefundWithoutOrderEvent> {
  private readonly logger = new Logger(OnRefundWithoutOrder.name);

  constructor(
    private readonly journal: Journal,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: RefundWithoutOrderEvent): void {
    void this.work.track(this.run(event), "on-refund-without-order");
  }

  private async run({ report }: RefundWithoutOrderEvent): Promise<void> {
    try {
      await this.journal.append({
        type: "payment_refund.unmatched",
        subjectType: "payment_refund",
        subjectId: report.stripeRefundId,
        payload: {
          amountCents: report.amountCents,
          currency: report.currency,
          status: report.status,
          refundedAt: report.refundedAt.toISOString(),
        },
      });
      await this.notifier.notify([
        {
          kind: "payment_refund.unmatched",
          subject: `Remboursement Stripe hors commande — ${euros(report.amountCents)}`,
          body:
            `Stripe a remboursé ${euros(report.amountCents)} (${report.stripeRefundId}) sur un ` +
            "paiement qu'aucune commande ne porte — un lien libre, le plus souvent. Aucun avoir " +
            "n'est émis : si ce paiement soldait une facture, l'avoir est à faire à la main.",
          link: PAYMENT_LINKS_SCREEN,
          idempotencyKey: `notification:payment_refund.unmatched:${report.stripeRefundId}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(
        `Remboursement hors commande non signalé (${report.stripeRefundId})`,
        error,
      );
    }
  }
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
