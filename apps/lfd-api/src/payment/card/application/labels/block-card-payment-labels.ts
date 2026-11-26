import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  type CardPaymentDescription,
  CardPaymentLabels,
} from "../../../channels/requests/card-payment-labels.js";
import type { CardSubject } from "../../../channels/subjects/index.js";
import { IntentRelabel } from "../../domain/entities/intent-relabel.js";
import { IntentRelabelConflictError } from "../../domain/errors/card-payment-errors.js";
import { CardPaymentRepository } from "../../domain/ports/card-payment.repository.js";
import { IntentRelabelRepository } from "../../domain/ports/intent-relabel.repository.js";
import { IntentLabel } from "../../domain/value-objects/intent-label.js";
import { CardAccountChoice } from "../card-account-choice.js";
import { IntentRelabelPoster } from "./intent-relabel-poster.js";

const POST_RELABEL = "card-payment.post-intent-relabel";

/**
 * **Le libellé définitif, gardé puis posé** (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — l'implémentation
 * du canal. DANS la transaction de l'appelant : la ligne du libellé s'écrit
 * avec le reçu de son abonné, ou pas du tout ; l'appel au prestataire part
 * après validation, et le balayage reprend ce qui n'a pas abouti.
 */
@Injectable()
export class BlockCardPaymentLabels extends CardPaymentLabels {
  private readonly logger = new Logger(BlockCardPaymentLabels.name);

  constructor(
    private readonly choice: CardAccountChoice,
    private readonly payments: CardPaymentRepository,
    private readonly relabels: IntentRelabelRepository,
    private readonly poster: IntentRelabelPoster,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly clock: Clock,
  ) {
    super();
  }

  /**
   * @throws {InvalidCardPaymentLabelError} une clé réservée, mal formée, ou trop de clés.
   * @throws {IntentRelabelConflictError} un autre libellé du même paiement écrit en même temps.
   */
  async describe(
    subject: CardSubject,
    providerRef: string,
    label: CardPaymentDescription,
  ): Promise<void> {
    const shown = IntentLabel.of(label);
    const { account } = this.choice.forSubjectType(subject.type);
    const payment = await this.payments.findByProviderRef(account, providerRef);
    if (
      payment === null ||
      payment.subject.type !== subject.type ||
      payment.subject.id !== subject.id
    ) {
      this.logger.warn(
        `Libellé non gardé : l'intention ${providerRef} n'est pas un paiement de ` +
          `${subject.type}:${subject.id} sur le compte ${account.name}.`,
      );
      return;
    }
    const at = this.clock.now();
    const existing = await this.relabels.load(payment.id);
    if (existing !== null && !existing.describe(shown, at)) {
      return;
    }
    if (!(await this.relabels.save(existing ?? IntentRelabel.request(payment.id, shown, at)))) {
      throw new IntentRelabelConflictError(payment.id);
    }
    this.afterCommit.defer(
      () =>
        this.work.track(
          this.poster.post(payment.id).then(() => undefined),
          POST_RELABEL,
        ),
      POST_RELABEL,
    );
  }
}
