import { Injectable } from "@nestjs/common";

import { CustomerCancellationSettingsReader } from "../../../order-opening/domain/ports/customer-cancellation-settings.reader.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import {
  BEFORE_INSCRIPTION,
  cancellationAllowanceOf,
  type CancellationAllowance,
} from "../../domain/services/cancellation-allowance.js";

/**
 * **L'autorisation d'une annulation, lue au réglage** (plan
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * C7 § 4). Une commande de société n'a pas à lire le réglage : sa limite est
 * toujours l'inscription (A1 § 4, Q1).
 *
 * Le réglage est relu sans verrou, comme le délai (`CustomerCancellationPolicyGate`) :
 * un changement pendant la requête s'applique à la suivante.
 */
@Injectable()
export class CancellationAllowanceGate {
  constructor(private readonly settings: CustomerCancellationSettingsReader) {}

  async of(subject: CancellationSubject): Promise<CancellationAllowance> {
    if (subject.companyId !== null) {
      return BEFORE_INSCRIPTION;
    }
    const policy = await this.settings.current();
    return cancellationAllowanceOf(subject.companyId, policy.b2cCancellableUntil);
  }
}
