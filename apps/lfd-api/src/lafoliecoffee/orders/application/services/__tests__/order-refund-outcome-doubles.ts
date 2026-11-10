import { OrderRefundStatusWriter } from "../../../domain/ports/order-refund-status.writer.js";

/**
 * La vue « remboursée » d'une commande, doublée : elle note chaque bascule
 * demandée et franchit selon le règlement qu'on lui donne — la condition
 * `paid → refunded` / `refunded → paid` de l'adaptateur réel.
 */
export class RecordingRefundStatus extends OrderRefundStatusWriter {
  readonly calls: string[] = [];

  constructor(public paymentStatus: "paid" | "refunded" | "failed" = "paid") {
    super();
  }

  markRefunded(orderId: string): Promise<boolean> {
    this.calls.push(`markRefunded:${orderId}`);
    const crossed = this.paymentStatus === "paid";
    if (crossed) {
      this.paymentStatus = "refunded";
    }
    return Promise.resolve(crossed);
  }

  restorePaid(orderId: string): Promise<boolean> {
    this.calls.push(`restorePaid:${orderId}`);
    const crossed = this.paymentStatus === "refunded";
    if (crossed) {
      this.paymentStatus = "paid";
    }
    return Promise.resolve(crossed);
  }
}
