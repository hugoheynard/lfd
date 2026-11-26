import { Injectable, Logger } from "@nestjs/common";

import { WallClock } from "../../../../platform/time/wall-clock.js";
import type { IntentRelabel } from "../../domain/entities/intent-relabel.js";
import { CardPaymentRepository } from "../../domain/ports/card-payment.repository.js";
import type { IntentDescribing } from "../../domain/ports/card-provider-types.js";
import { CardProviders } from "../../domain/ports/card-providers.js";
import { IntentRelabelRepository } from "../../domain/ports/intent-relabel.repository.js";

/** Ce qu'un passage a fait du libellé d'un paiement. */
export type IntentRelabelPosting = "posted" | "retry" | "abandoned" | "skipped";

/** Le motif d'un abandon sans appel : le paiement n'a plus d'intention à redire. */
const NO_INTENT = "aucune intention sur le paiement";

/**
 * **Pose un libellé chez le prestataire** (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — après validation,
 * puis par le balayage. 🔴 HORS transaction : l'appel part sur le compte DE LA
 * LIGNE, puis l'issue s'écrit conditionnée à la révision lue — un libellé
 * remplacé entre-temps n'est pas conclu par cet essai.
 *
 * L'échéance et l'issue se datent à l'horloge MURALE, comme le balayage qui
 * le reprend. Un abandon est journalisé par identifiants seuls (`log-no-email`) et ne
 * touche jamais au paiement.
 */
@Injectable()
export class IntentRelabelPoster {
  private readonly logger = new Logger(IntentRelabelPoster.name);

  constructor(
    private readonly relabels: IntentRelabelRepository,
    private readonly payments: CardPaymentRepository,
    private readonly providers: CardProviders,
    private readonly wall: WallClock,
  ) {}

  async post(paymentId: string): Promise<IntentRelabelPosting> {
    const relabel = await this.relabels.load(paymentId);
    if (relabel === null || !relabel.isDueAt(this.wall.elapsedNow())) {
      return "skipped";
    }
    const payment = await this.payments.load(paymentId);
    const providerRef = payment?.providerRef ?? null;
    if (payment === null || providerRef === null) {
      return this.conclude(relabel, { kind: "refused", reason: NO_INTENT });
    }
    const outcome = await this.providers
      .forAccount(payment.account)
      .describeIntent(providerRef, relabel.label());
    return this.conclude(relabel, outcome);
  }

  private async conclude(
    relabel: IntentRelabel,
    outcome: IntentDescribing,
  ): Promise<IntentRelabelPosting> {
    const revision = relabel.revision;
    const posting = this.decide(relabel, outcome);
    if (posting === "skipped" || !(await this.relabels.save(relabel))) {
      return "skipped";
    }
    if (posting === "abandoned") {
      const reason = outcome.kind === "described" ? "" : outcome.reason;
      this.logger.warn(
        `Libellé du paiement ${relabel.paymentId} abandonné (révision ${String(revision)}) : ` +
          `${reason}. Le paiement n'est pas touché.`,
      );
    }
    return posting;
  }

  /** L'issue de l'appel, portée par l'agrégat ; `skipped` : l'essai ne concluait plus rien. */
  private decide(relabel: IntentRelabel, outcome: IntentDescribing): IntentRelabelPosting {
    const at = this.wall.elapsedNow();
    if (outcome.kind === "described") {
      return relabel.markPosted(relabel.revision, at) ? "posted" : "skipped";
    }
    const decision = relabel.markFailed(
      relabel.revision,
      outcome.reason,
      outcome.kind === "refused",
      at,
    );
    return decision === "stale" ? "skipped" : decision;
  }
}
