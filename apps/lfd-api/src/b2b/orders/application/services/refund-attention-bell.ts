import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { refundEuros } from "../../domain/services/order-cancellation-refund.js";

/**
 * Les incidents d'un remboursement demandé qui appellent un humain (C4.8).
 * Aucune cloche quand tout va bien.
 */
export type RefundAttentionCause = "unavailable" | "declined" | "nothing_left" | "failed";

export interface RefundAttention {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly generation: number;
  readonly announcedCents: number;
  readonly cause: RefundAttentionCause;
}

const SUBJECTS: Readonly<Record<RefundAttentionCause, string>> = {
  unavailable: "Remboursement pas encore envoyé à Stripe",
  declined: "Remboursement refusé par Stripe",
  nothing_left: "Rien à rembourser chez Stripe — vérifier le tableau de bord",
  failed: "Remboursement échoué chez Stripe — à traiter",
};

const GESTURES: Readonly<Record<RefundAttentionCause, string>> = {
  unavailable:
    "Stripe n'a pas répondu. Le système réessaie tout seul ; si cela dure, ouvrez la commande et relancez.",
  declined:
    "Rejouer n'y changera rien : remboursez le client autrement (virement) et vérifiez le paiement dans Stripe.",
  nothing_left:
    "Stripe dit le paiement déjà rendu, mais la commande ne le sait pas : comparez avec le tableau de bord Stripe.",
  failed:
    "La banque a refusé le remboursement (carte fermée ?). Relancez depuis la commande, ou remboursez par virement.",
};

/**
 * **La cloche `order.refund_attention`** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.8) — sans
 * destinataire nommé, comme « encaissé après annulation » : visible de tout
 * le back-office. Une clé par commande, génération et cause : un rejeu ne
 * sonne pas deux fois. Écrite dans la transaction de l'appelant.
 */
@Injectable()
export class RefundAttentionBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  ring(attention: RefundAttention): Promise<void> {
    const { orderId, orderNumber, generation, cause } = attention;
    return this.notifier.notify([
      {
        kind: "order.refund_attention",
        subject: `${SUBJECTS[cause]} — ${orderNumber}`,
        body: `Commande ${orderNumber}, remboursement de ${refundEuros(attention.announcedCents)}. ${GESTURES[cause]}`,
        link: `/commandes/${orderId}`,
        idempotencyKey: `notification:order.refund_attention:${orderId}:${String(generation)}:${cause}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}
