import type {
  CustomerCancellationMoney,
  CustomerCancellationRefusal,
  OrderCancellability,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import {
  CancellationSubjectReader,
  type CancellationSubject,
} from "../../domain/ports/cancellation-subject.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";
import { customerRefusalOf } from "../../domain/services/customer-cancellation-refusal.js";
import {
  cancellationOf,
  type CancellableRegime,
} from "../../domain/services/order-cancellation.js";
import { CancellationRule } from "./cancellation-rule.js";
import { CustomerCancellationPolicyGate } from "./customer-cancellation-policy.js";

/**
 * **La commande s'annule-t-elle, pour ce client, maintenant ?** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.8).
 *
 * La même règle que le geste (`cancellationOf`, l'inscription au fournil
 * demandée à son guichet) et le même réglage (P1/P2), SANS verrou : c'est un
 * affichage — le `POST` relit tout sous verrou. Les raisons durables (déjà
 * annulée, prête, en préparation) passent avant le réglage : elles disent
 * mieux pourquoi.
 *
 * Le mur est la décision de l'appelant ; `allowed: false` (visible mais pas
 * annulable par ce compte) rend `not_allowed`.
 */
@Injectable()
export class CustomerCancellability {
  constructor(
    private readonly subjects: CancellationSubjectReader,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly rule: CancellationRule,
    private readonly policy: CustomerCancellationPolicyGate,
  ) {}

  async of(
    subject: CustomerCancellationSubject,
    now: Date,
    allowed: CustomerCancellationRefusal | true,
  ): Promise<OrderCancellability> {
    const [staffSubject, inscribedDay] = await Promise.all([
      this.subjects.find(subject.orderId),
      this.inscriptions.inscribedDayOf(subject.orderId),
    ]);
    if (staffSubject === null) {
      return refused("not_allowed");
    }
    const decision = cancellationOf(await this.rule.stateOf(staffSubject, inscribedDay));
    if (!decision.cancellable) {
      return refused(customerRefusalOf(decision.block) ?? "not_allowed");
    }
    if (allowed !== true) {
      return refused(allowed);
    }
    const applied = await this.policy.windowOf(subject, now);
    if (applied === null) {
      return cancellable(null, staffSubject, decision.regime);
    }
    switch (applied.window.kind) {
      case "open":
        return cancellable(applied.window.until, staffSubject, decision.regime);
      case "closed":
        return refused("closed");
      case "too_late":
        return refused("too_late", applied.window.until);
    }
  }
}

function refused(
  code: CustomerCancellationRefusal,
  until: Date | null = null,
): OrderCancellability {
  return { cancellable: false, code, until: until === null ? null : until.toISOString() };
}

function cancellable(
  until: Date | null,
  subject: CancellationSubject,
  regime: CancellableRegime,
): OrderCancellability {
  return {
    cancellable: true,
    until: until === null ? null : until.toISOString(),
    money: moneyOf(subject, regime),
    voucherReturned: subject.loyaltyVoucherId !== null,
  };
}

/** Ce qui arrivera à l'argent, par régime (C6.8). */
function moneyOf(
  subject: CancellationSubject,
  regime: CancellableRegime,
): CustomerCancellationMoney {
  switch (regime) {
    case "free":
    case "due":
      return { kind: "nothing_charged" };
    case "account":
      return { kind: "account" };
    case "paid":
      return subject.refunds.refundableCents > 0
        ? { kind: "refund", amountCents: subject.refunds.refundableCents }
        : { kind: "nothing_charged" };
  }
}
