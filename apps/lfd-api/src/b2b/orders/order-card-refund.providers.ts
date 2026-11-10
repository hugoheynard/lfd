import type { Provider } from "@nestjs/common";

import { RefundPaidAfterCancellation } from "./application/handlers/refund-paid-after-cancellation.handler.js";
import { AdminOrderRefundView } from "./application/services/admin-order-refund-view.js";
import { CancellationRefundRequester } from "./application/services/cancellation-refund-requester.js";
import { OrderCardRefundReadings } from "./infrastructure/order-card-refund-readings.js";

/**
 * **Ce que le commerce garde du remboursement par carte** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §5.4, lot P1.c) — la demande à l'annulation, celle de l'encaissé
 * après annulation, le bandeau du détail staff, et la lecture des
 * remboursements d'une commande au bloc `card-payment`.
 *
 * Le remboursement lui-même — la demande, son exécuteur, son balayage,
 * « Relancer », le constat, l'inversion, la cloche — vit dans `card-payment`
 * depuis le lot P1.b ; l'ancien module d'`orders` (`order-refund.providers.ts`)
 * est retiré ici, avec ses tables désormais sans lecteur jusqu'à P2.
 */
export const ORDER_CARD_REFUND_PROVIDERS: readonly Provider[] = [
  OrderCardRefundReadings,
  CancellationRefundRequester,
  AdminOrderRefundView,
  RefundPaidAfterCancellation,
];
