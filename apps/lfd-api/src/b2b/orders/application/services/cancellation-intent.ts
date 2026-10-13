import type { CustomerCancellationReasonCode } from "@lfd/contracts";

import type { CancellationPolicyApplied } from "../../domain/events/order-cancelled.event.js";
import type { CancellationRecord } from "../../domain/ports/order-cancellation.repository.js";
import type { CancellationActor } from "../../domain/services/cancellation-actor.js";

/**
 * Ce qu'une annulation emporte avec elle, en plus de la commande : qui, et
 * pourquoi. Le motif staff est obligatoire (`CancellationReason`, validé par
 * l'appelant) ; celui d'un client est facultatif (lot C6, Q-C6.1).
 */
export interface CancellationIntent {
  readonly actor: CancellationActor;
  readonly reasonText: string | null;
  readonly reasonCode: CustomerCancellationReasonCode | null;
  /** Le délai appliqué à un particulier, figé au fait (C6.5) ; `null` sinon. */
  readonly policy: CancellationPolicyApplied | null;
}

/**
 * L'écriture de l'annulation. L'équipe : la forme d'avant C6, sans clé
 * `customer` (l'adaptateur écrit `staff`). Un client : sa fiche en
 * `customer`, et `cancelledBy` nul.
 */
export function recordOf(intent: CancellationIntent, now: Date): CancellationRecord {
  const { actor } = intent;
  if (actor.kind === "staff") {
    return { cancelledBy: actor.staffUserId, reason: intent.reasonText, cancelledAt: now };
  }
  return {
    cancelledBy: null,
    reason: intent.reasonText,
    cancelledAt: now,
    customer: { kind: actor.kind, userId: actor.userId, reasonCode: intent.reasonCode },
  };
}
