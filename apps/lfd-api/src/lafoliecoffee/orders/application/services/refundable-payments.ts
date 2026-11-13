import { Injectable } from "@nestjs/common";

import {
  type CardPaymentLine,
  type CardSettlementPosition,
  CardSettlementReader,
} from "../../../../card-payment/channels/requests/index.js";
import { OrderCardAdoption } from "../../domain/ports/order-card-payments.js";
import { CardIncreaseProposalReader } from "../../revision/domain/ports/card-increase-proposal.reader.js";
import type { RefundablePayment } from "../../revision/domain/services/revision-card-refund.js";
import { orderCardSubject } from "./order-card-subject.js";

/**
 * `adopt` : une COMMANDE, sous le verrou `orders` — le premier paiement est
 * adopté s'il manque. `read` : un affichage — il ne l'est jamais (une lecture
 * n'adopte pas, `OrderCardRetrieval`) ; une commande d'avant le bloc
 * `card-payment` n'a alors aucun paiement qui se rend.
 */
export type RefundablesMode = "adopt" | "read";

/** Les paiements d'une commande qui se rendent, et la position carte qui les porte. */
export interface OrderRefundables {
  /** Le premier paiement et les compléments `applied`, du plus ancien au plus récent. */
  readonly payments: readonly RefundablePayment[];
  /** Un de ces paiements n'est pas encaissé (`pending`, `failed`, `closed`). */
  readonly unpaid: boolean;
  /** `null` : le bloc n'a rendu aucune position pour la commande. */
  readonly position: CardSettlementPosition | null;
}

/**
 * **Les paiements d'une commande qui se rendent** (R4 du plan S1,
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) —
 * le premier paiement et les compléments dont le projet est `applied`, jamais
 * celui d'un projet `refused` ou `closed`, que ses abonnés rendent eux-mêmes.
 * Partagé par la baisse d'une révision et le reste d'un départ incomplet (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) : les
 * deux rendent sur les mêmes paiements.
 *
 * En `adopt`, l'adoption est la seule écriture : idempotente, sans argent ni
 * réseau, dans la transaction de l'appelant — validée avec elle ou annulée
 * avec tout. Les restes se lisent un à un, sous le verrou que l'appelant tient.
 */
@Injectable()
export class RefundablePayments {
  constructor(
    private readonly cards: OrderCardAdoption,
    private readonly proposals: CardIncreaseProposalReader,
    private readonly settlements: CardSettlementReader,
  ) {}

  async of(orderId: string, mode: RefundablesMode): Promise<OrderRefundables> {
    const adopted = mode === "adopt" ? await this.cards.ensureFirst(orderId) : null;
    const applied = await this.proposals.appliedPaymentsOf(orderId);
    const [position] = await this.settlements.positionOf([orderCardSubject(orderId)]);
    // En `adopt`, le premier paiement est celui que l'adoption rend, et lui seul.
    const first = mode === "adopt" ? adopted : firstOf(position?.payments ?? []);
    const refundable = new Set([...(first === null ? [] : [first.paymentId]), ...applied]);
    const payments: RefundablePayment[] = [];
    let unpaid = false;
    for (const line of position?.payments ?? []) {
      if (refundable.has(line.paymentId)) {
        unpaid ||= line.state !== "paid";
        // Un à un : la même transaction, sous le même verrou.
        const remainderCents = await this.settlements.remainderOf(line.paymentId);
        payments.push({ paymentId: line.paymentId, remainderCents });
      }
    }
    return { payments, unpaid, position: position ?? null };
  }
}

function firstOf(payments: readonly CardPaymentLine[]): CardPaymentLine | null {
  return payments.find((payment) => payment.role === "first") ?? null;
}
