import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  type CardSubject,
  type SubjectClaim,
  type SubjectDescription,
  type SubjectPaidOutcome,
  type SubjectPaymentRole,
  type SubjectReference,
  type SubjectRefundOutcome,
  SubjectSettlement,
} from "../../../channels/subjects/index.js";
import { PayLinkTestNotFoundError } from "../domain/errors/pay-link-test-errors.js";
import type { PayLinkTest } from "../domain/pay-link-test.js";
import {
  PAY_LINK_TEST_DESCRIPTION,
  PAY_LINK_TEST_SCREEN,
  PAY_LINK_TEST_SUBJECT_TYPE,
} from "../domain/pay-link-test-subject.js";
import { PayLinkTestRepository } from "../domain/ports/pay-link-test.repository.js";
import { PayLinkTestRefundOutcomes } from "./pay-link-test-refund-outcomes.js";

/**
 * **L'essai, sujet du bloc `payment`** — l'implémentation `payment_test` du
 * canal retour, reliée par `appBootstrap/card-payment-feed.module.ts`. Le
 * seul sujet que le bloc possède : il n'est rien d'autre qu'un essai du bloc.
 * Chaque méthode qui écrit tourne dans la transaction de `payment`, sous le
 * verrou de la ligne de l'essai.
 *
 * - **Payé** : l'essai passe `paid` — `applied` ; le même paiement rejoué,
 *   `already_applied`. Un lien n'a qu'un premier paiement (l'index
 *   `card_payment_first_per_subject_key`) : un complément ne peut naître
 *   d'une page, et s'il arrivait il est `refused`. Le remboursement n'est PAS
 *   demandé ici — la ligne du paiement n'est pas encore `paid` : c'est
 *   l'abonné `RefundPaidPayLinkTest`, sur `card_payment.settled`, qui le fait.
 * - **Refusé par la banque** : rien, la page se rejoue.
 * - **Annulé** : un essai de plus de 24 heures.
 * - **`claim` / `referencesSince`** : un essai naît avec son lien, aucune
 *   intention d'avant le bloc à rapprocher.
 */
@Injectable()
export class PayLinkTestSettlement extends SubjectSettlement {
  readonly subjectType = PAY_LINK_TEST_SUBJECT_TYPE;

  constructor(
    private readonly tests: PayLinkTestRepository,
    private readonly refunds: PayLinkTestRefundOutcomes,
    private readonly clock: Clock,
  ) {
    super();
  }

  /** Le `FOR UPDATE` de sa ligne `pay_link_test`. */
  async lockSubject(subject: CardSubject): Promise<void> {
    await this.locked(subject);
  }

  async onPaid(
    subject: CardSubject,
    _paymentId: string,
    _amountCents: number,
    role: SubjectPaymentRole,
  ): Promise<SubjectPaidOutcome> {
    if (role !== "first") {
      return "refused";
    }
    const test = await this.locked(subject);
    if (test.markPaid(this.clock.now()) === "already_applied") {
      return "already_applied";
    }
    await this.tests.save(test);
    return "applied";
  }

  /** Rien : l'essai reste envoyé, la page se rejoue. */
  onPaymentFailed(): Promise<void> {
    return Promise.resolve();
  }

  async onRefundOutcome(subject: CardSubject, outcome: SubjectRefundOutcome): Promise<void> {
    await this.refunds.apply(await this.locked(subject), outcome);
  }

  /** Vrai après 24 heures : l'essai ne se paie plus. */
  async isCancelled(subject: CardSubject): Promise<boolean> {
    return (await this.loaded(subject)).isPastWindowAt(this.clock.now());
  }

  /** Le même libellé partout — l'avis à la comptabilité le recopie : il dit l'essai. */
  describe(): Promise<SubjectDescription> {
    return Promise.resolve({ label: PAY_LINK_TEST_DESCRIPTION, link: PAY_LINK_TEST_SCREEN });
  }

  claim(): Promise<SubjectClaim | null> {
    return Promise.resolve(null);
  }

  referencesSince(): Promise<readonly SubjectReference[]> {
    return Promise.resolve([]);
  }

  /** @throws {PayLinkTestNotFoundError} aucun essai sous cet identifiant. */
  private async locked(subject: CardSubject): Promise<PayLinkTest> {
    const test = await this.tests.loadLocked(subject.id);
    if (test === null) {
      throw new PayLinkTestNotFoundError(subject.id);
    }
    return test;
  }

  /** @throws {PayLinkTestNotFoundError} aucun essai sous cet identifiant. */
  private async loaded(subject: CardSubject): Promise<PayLinkTest> {
    const test = await this.tests.load(subject.id);
    if (test === null) {
      throw new PayLinkTestNotFoundError(subject.id);
    }
    return test;
  }
}
