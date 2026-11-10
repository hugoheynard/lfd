import { Injectable } from "@nestjs/common";

import {
  CARD_PAYMENT_UNMATCHED,
  CardPaymentUnmatchedFact,
  type ProviderRefund,
} from "../../../../card-payment/channels/facts/index.js";
import { Journal } from "../../../../platform/journal/journal.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";

/** Où l'équipe ouvre les liens libres. */
const PAYMENT_LINKS_SCREEN = "/comptabilite/liens-de-paiement";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_REFUND_WITHOUT_ORDER = "b2b.payments.refund-without-order";

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
 * ## Son déclencheur a changé au lot P0.c2 du plan M2 (2026-11-09)
 *
 * Il écoutait `RefundWithoutOrderEvent`, en mémoire, publié par le constat
 * d'`orders`. Le webhook des cartes appartient désormais au bloc
 * `card-payment`, qui publie `card_payment.unmatched` — DURABLE — pour tout
 * événement hors de ses sujets. Il **ne sonne que sur un remboursement**
 * (`refund` non nul) : le reste n'est pas une anomalie en soi (§3.3). Le
 * message est celui d'avant, mot pour mot.
 *
 * Le fait du journal n'a pas de clé propre : un `refund.created` puis un
 * `refund.updated` pour le même remboursement font deux lignes, chacune avec
 * son statut. La cloche, elle, dédoublonne par remboursement. Une panne du
 * journal ou de la cloche lève : la boîte d'envoi rejoue.
 */
@Injectable()
@DurableHandler({ type: CARD_PAYMENT_UNMATCHED, subscriber: ON_REFUND_WITHOUT_ORDER })
export class OnRefundWithoutOrder implements DurableSubscriber {
  constructor(
    private readonly journal: Journal,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const { refund } = CardPaymentUnmatchedFact.fromPayload(delivery.payload);
    if (refund === null) {
      return;
    }
    await this.note(refund);
    await this.ring(refund);
  }

  private async note(refund: ProviderRefund): Promise<void> {
    await this.journal.append({
      type: "payment_refund.unmatched",
      subjectType: "payment_refund",
      subjectId: refund.refundId,
      payload: {
        amountCents: refund.amountCents,
        currency: refund.currency,
        status: refund.status,
        refundedAt: refund.refundedAt.toISOString(),
      },
    });
  }

  private async ring(refund: ProviderRefund): Promise<void> {
    await this.notifier.notify([
      {
        kind: "payment_refund.unmatched",
        subject: `Remboursement Stripe hors commande — ${euros(refund.amountCents)}`,
        body:
          `Stripe a remboursé ${euros(refund.amountCents)} (${refund.refundId}) sur un ` +
          "paiement qu'aucune commande ne porte — un lien libre, le plus souvent. Aucun avoir " +
          "n'est émis : si ce paiement soldait une facture, l'avoir est à faire à la main.",
        link: PAYMENT_LINKS_SCREEN,
        idempotencyKey: `notification:payment_refund.unmatched:${refund.refundId}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
