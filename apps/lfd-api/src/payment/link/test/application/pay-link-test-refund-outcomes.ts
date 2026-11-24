import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { SubjectRefundOutcome } from "../../../channels/subjects/index.js";
import type { PayLinkTest } from "../domain/pay-link-test.js";
import { PayLinkTestRepository } from "../domain/ports/pay-link-test.repository.js";
import { PayLinkTestBell } from "./pay-link-test-bell.js";

/** Ce qu'une issue fait d'un essai : rendu, en échec (avec la clé de sa cloche), ou rien. */
type Reaction =
  | { readonly kind: "refunded" }
  | { readonly kind: "failed"; readonly reference: string }
  | { readonly kind: "none" };

const NONE: Reaction = { kind: "none" };

/**
 * **Chaque genre d'issue, et ce qu'il fait d'un essai** — exhaustif : un genre
 * de plus sans sa réaction ne compile pas.
 *
 * - rendu (`succeeded`, `settled_elsewhere`) : `refunded`, seulement quand
 *   tout l'encaissé l'est — une issue terminale réussie ;
 * - échoué, inversé, refusé par le carnet : `refund_failed`, et la cloche ;
 * - en attente (`recorded`), émis (`issued`) : rien — `pending` n'est pas rendu ;
 * - un essai d'émission raté (`attempted`) : rien ici — le bloc réessaie seul,
 *   et sa propre cloche des remboursements sonne déjà.
 */
function reactionTo(outcome: SubjectRefundOutcome): Reaction {
  switch (outcome.kind) {
    case "succeeded":
    case "settled_elsewhere":
      return outcome.position.refundedCents >= outcome.position.chargedCents
        ? { kind: "refunded" }
        : NONE;
    case "failed":
      return { kind: "failed", reference: outcome.refundId };
    case "reversed":
      return { kind: "failed", reference: `${outcome.refundId}:reversed` };
    case "rejected":
      return { kind: "failed", reference: `rejected:${outcome.providerRef}` };
    case "recorded":
    case "issued":
    case "attempted":
      return NONE;
  }
}

/**
 * **L'issue d'un remboursement, appliquée à l'essai** — dans la transaction
 * de `payment`, sous le verrou de la ligne de l'essai. Une panne lève : le
 * constat se rejoue.
 */
@Injectable()
export class PayLinkTestRefundOutcomes {
  constructor(
    private readonly tests: PayLinkTestRepository,
    private readonly bell: PayLinkTestBell,
    private readonly clock: Clock,
  ) {}

  async apply(test: PayLinkTest, outcome: SubjectRefundOutcome): Promise<void> {
    const reaction = reactionTo(outcome);
    if (reaction.kind === "refunded") {
      if (test.markRefunded(this.clock.now())) {
        await this.tests.save(test);
      }
      return;
    }
    if (reaction.kind === "failed") {
      if (test.markRefundFailed()) {
        await this.tests.save(test);
      }
      await this.bell.refundFailed(test.id, reaction.reference);
    }
  }
}
