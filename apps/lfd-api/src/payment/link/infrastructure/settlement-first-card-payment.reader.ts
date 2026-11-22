import { Injectable } from "@nestjs/common";

import { CardSettlementReader } from "../../channels/requests/card-settlement.reader.js";
import {
  type FirstCardPayment,
  FirstCardPaymentReader,
} from "../domain/ports/first-card-payment.reader.js";

/**
 * Le premier paiement d'un sujet, lu par la lecture que la carte publie
 * (`CardSettlementReader`) : les liens ne lisent pas la table des paiements.
 */
@Injectable()
export class SettlementFirstCardPaymentReader extends FirstCardPaymentReader {
  constructor(private readonly settlements: CardSettlementReader) {
    super();
  }

  async firstOf(subjectType: string, subjectId: string): Promise<FirstCardPayment | null> {
    const [position] = await this.settlements.positionOf([{ type: subjectType, id: subjectId }]);
    const first = position?.payments.find((payment) => payment.role === "first");
    return first === undefined
      ? null
      : { paymentId: first.paymentId, amountCents: first.amountCents };
  }
}
