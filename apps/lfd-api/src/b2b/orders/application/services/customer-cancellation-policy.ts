import { Injectable } from "@nestjs/common";

import { CustomerCancellationSettingsReader } from "../../../order-opening/domain/ports/customer-cancellation-settings.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";
import {
  cancellationAnchorOf,
  customerCancellationWindowAt,
  customerCancellationWindowOf,
  type CustomerCancellationWindow,
} from "../../domain/services/customer-cancellation-window.js";

/** P2 appliqué, et le délai qui l'a été — à figer dans le fait. */
export interface AppliedCustomerWindow {
  readonly window: CustomerCancellationWindow;
  readonly hoursBefore: number;
}

/**
 * **Le réglage, lu une fois, appliqué à une commande personnelle** (C6.3).
 * `null` — aucun délai, seul le compte à produire limite — pour une commande
 * de société (décision 2) et pour un particulier quand le réglage n'impose
 * pas de délai (décision du 2026-10-13).
 *
 * **L'instant figé à la passation fait foi** (Hugo, 2026-10-26) : posé, le
 * réglage n'est pas lu du tout — ni son délai, ni son interrupteur. Les CGV
 * promettent le délai rappelé avant la validation. Seules les commandes
 * d'avant la colonne (`customerCancellableUntil` nul) jugent au réglage du jour.
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
    if (subject.customerCancellableUntil !== null) {
      return frozenWindowOf(subject, subject.customerCancellableUntil, now);
    }
    const policy = await this.settings.current();
    if (!policy.delayEnabled) {
      return null;
    }
    return {
      window: customerCancellationWindowOf(policy.hoursBefore, subject, now),
      hoursBefore: policy.hoursBefore,
    };
  }
}

const HOUR_MS = 3_600_000;

/**
 * P2 contre l'instant figé. Le délai que le fait `order.cancelled` fige se
 * relit sur l'écart entre l'ancre et l'instant — exact tant que le jour et le
 * créneau n'ont pas bougé depuis la passation, borné à zéro sinon.
 */
function frozenWindowOf(
  subject: CustomerCancellationSubject,
  until: Date,
  now: Date,
): AppliedCustomerWindow {
  const anchor = cancellationAnchorOf(subject);
  const hours = anchor === null ? 0 : Math.round((anchor.getTime() - until.getTime()) / HOUR_MS);
  return { window: customerCancellationWindowAt(until, now), hoursBefore: Math.max(0, hours) };
}
