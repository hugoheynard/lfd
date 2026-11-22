import {
  type LinkPaymentReceipt,
  LinkPaymentNotice,
} from "../../domain/ports/link-payment-notice.js";
import { Timeline } from "./card-payment-doubles.js";

/** L'avis à l'équipe, noté dans la chronologie — écrit à la main, en héritant du port. */
export class RecordingLinkPaymentNotice extends LinkPaymentNotice {
  readonly receipts: LinkPaymentReceipt[] = [];

  constructor(private readonly timeline = new Timeline()) {
    super();
  }

  paid(receipt: LinkPaymentReceipt): Promise<void> {
    this.timeline.note(`notice:${receipt.paymentId}`);
    this.receipts.push(receipt);
    return Promise.resolve();
  }
}
