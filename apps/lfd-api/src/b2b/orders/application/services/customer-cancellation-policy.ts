import { Injectable } from "@nestjs/common";

import { CustomerCancellationSettingsReader } from "../../../order-opening/domain/ports/customer-cancellation-settings.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";
import {
  customerCancellationWindowOf,
  type CustomerCancellationWindow,
} from "../../domain/services/customer-cancellation-window.js";

/** P1/P2 appliqués, et le délai qui l'a été — à figer dans le fait. */
export interface AppliedCustomerWindow {
  readonly window: CustomerCancellationWindow;
  readonly hoursBefore: number;
}

/**
 * **Le réglage, lu une fois, appliqué à une commande personnelle** (C6.3).
 * Une commande de société n'a ni P1 ni P2 (décision 2) : `null`.
 *
 * Le réglage est relu à chaque requête, sans verrou : un changement pendant
 * la requête s'applique à la suivante (S5). Le délai se compare au `now`
 * GELÉ que l'appelant reçoit de son `Clock` — monotone, il ne change pas
 * sous le verrou.
 */
@Injectable()
export class CustomerCancellationPolicyGate {
  constructor(private readonly settings: CustomerCancellationSettingsReader) {}

  async windowOf(
    subject: CustomerCancellationSubject,
    now: Date,
  ): Promise<AppliedCustomerWindow | null> {
    if (subject.companyId !== null) {
      return null;
    }
    const policy = await this.settings.current();
    return {
      window: customerCancellationWindowOf(policy, subject, now),
      hoursBefore: policy.hoursBefore,
    };
  }
}
