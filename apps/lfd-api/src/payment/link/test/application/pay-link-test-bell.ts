import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PAY_LINK_TEST_SCREEN } from "../domain/pay-link-test-subject.js";

/**
 * **La cloche d'un essai** : un remboursement qui n'a pas rendu l'euro. La
 * clé suit le remboursement : un même échec constaté deux fois sonne une fois.
 */
@Injectable()
export class PayLinkTestBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async refundFailed(testId: string, reference: string): Promise<void> {
    await this.notifier.notify([
      {
        kind: "pay_link_test.refund_failed",
        subject: "Lien de paiement d'essai : l'euro n'est pas rendu",
        body:
          "Le remboursement d'un essai du paiement par lien n'a pas abouti : 1 € est resté " +
          "encaissé. Vérifiez-le dans le tableau de bord du prestataire, puis relancez-le " +
          "ou remboursez-le autrement.",
        link: PAY_LINK_TEST_SCREEN,
        idempotencyKey: `notification:pay_link_test.refund_failed:${testId}:${reference}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}
