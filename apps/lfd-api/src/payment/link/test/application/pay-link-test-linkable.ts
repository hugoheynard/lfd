import { Injectable } from "@nestjs/common";

import { PAY_LINK_ORIGINS } from "../../../../platform/config/pay-link-origins.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  type CardSubject,
  LinkableSubject,
  type SubjectQuote,
} from "../../../channels/subjects/index.js";
import { UnknownPayLinkOriginError } from "../../domain/errors/pay-link-errors.js";
import { PayLinkTestNotFoundError } from "../domain/errors/pay-link-test-errors.js";
import { PAY_LINK_TEST_AMOUNT_CENTS } from "../domain/pay-link-test.js";
import {
  PAY_LINK_TEST_DESCRIPTION,
  PAY_LINK_TEST_ORIGIN,
  PAY_LINK_TEST_PAYER_LABEL,
  PAY_LINK_TEST_SUBJECT_TYPE,
} from "../domain/pay-link-test-subject.js";
import { PayLinkTestRepository } from "../domain/ports/pay-link-test.repository.js";

/**
 * **« Combien, et pour qui ? » pour un essai** — l'implémentation
 * `payment_test` de `LinkableSubject`, reliée par
 * `appBootstrap/pay-link-feed.module.ts`.
 *
 * Toujours 1 € : le montant fait foi ICI, la colonne n'en est qu'une défense.
 * Payable tant que l'essai est envoyé et a moins de 24 heures ; au-delà la
 * page dit « plus valable » — le lien reste en base, il n'expire pas.
 */
@Injectable()
export class PayLinkTestLinkable extends LinkableSubject {
  readonly subjectType = PAY_LINK_TEST_SUBJECT_TYPE;

  constructor(
    private readonly tests: PayLinkTestRepository,
    private readonly clock: Clock,
  ) {
    super();
  }

  /**
   * @throws {PayLinkTestNotFoundError} aucun essai sous cet identifiant.
   * @throws {UnknownPayLinkOriginError} l'origine des essais n'est pas au registre.
   */
  async quote(subject: CardSubject): Promise<SubjectQuote> {
    const test = await this.tests.load(subject.id);
    if (test === null) {
      throw new PayLinkTestNotFoundError(subject.id);
    }
    if (test.state !== "sent") {
      return { payable: false, reason: "settled" };
    }
    if (!test.isPayableAt(this.clock.now())) {
      return { payable: false, reason: "cancelled" };
    }
    return {
      payable: true,
      amountCents: PAY_LINK_TEST_AMOUNT_CENTS,
      payeeName: payeeName(),
      payerName: PAY_LINK_TEST_PAYER_LABEL,
      reference: PAY_LINK_TEST_DESCRIPTION,
      dueOn: null,
    };
  }
}

/** Le libellé de l'origine des essais, lu au registre. */
function payeeName(): string {
  const origin = PAY_LINK_ORIGINS.find((entry) => entry.name === PAY_LINK_TEST_ORIGIN);
  if (origin === undefined) {
    throw new UnknownPayLinkOriginError(PAY_LINK_TEST_ORIGIN);
  }
  return origin.label;
}
