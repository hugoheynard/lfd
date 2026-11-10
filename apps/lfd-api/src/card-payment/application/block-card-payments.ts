import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import {
  type AttachedCardPayment,
  type CardPaymentCancellation,
  type CardPaymentPreparation,
  CardPayments,
  type CardProviderSettlement,
  type PreparedCardPayment,
  type RetrievedCardPayment,
} from "../channels/requests/card-payments.js";
import type {
  CardSubject,
  SubjectPaymentRole,
  SubjectSettledState,
} from "../channels/subjects/index.js";
import { CardPayment } from "../domain/entities/card-payment.js";
import { CardPaymentNotFoundError } from "../domain/errors/card-payment-errors.js";
import { CardPaymentRepository } from "../domain/ports/card-payment.repository.js";
import { CardProviders } from "../domain/ports/card-providers.js";
import { PaymentAccount } from "../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../domain/value-objects/payment-subject.js";
import { CardAccountChoice } from "./card-account-choice.js";
import { IntentOutcomeRecorder } from "./intent-outcome-recorder.js";

/** Devise unique de la plateforme : les montants sont des centimes d'euro. */
const CARD_CURRENCY = "eur";

/**
 * **La porte `CardPayments`, implémentée par le bloc** (plan M2, §3.3).
 *
 * Les appels au prestataire (`prepare`, `retrieve`, `cancel`, `release`)
 * partent hors transaction — l'adaptateur le vérifie
 * (`assertOutsideTransaction`) ; les écritures (`attach`, `adopt`) tombent
 * dans celle de l'appelant ; `cancel` ouvre la sienne, courte, APRÈS l'appel.
 */
@Injectable()
export class BlockCardPayments extends CardPayments {
  private readonly logger = new Logger(BlockCardPayments.name);

  constructor(
    private readonly choice: CardAccountChoice,
    private readonly providers: CardProviders,
    private readonly payments: CardPaymentRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly outcomes: IntentOutcomeRecorder,
  ) {
    super();
  }

  async prepare(
    subjectType: string,
    amountCents: number,
    tag: string,
  ): Promise<CardPaymentPreparation> {
    const { account, provider } = this.choice.forSubjectType(subjectType);
    const intent = await provider.createIntent({ amountCents, currency: CARD_CURRENCY, tag });
    return {
      prepared: { account: account.name, providerRef: intent.providerRef, amountCents },
      clientSecret: intent.clientSecret,
      publishableKey: provider.publishableKey(),
    };
  }

  async attach(
    subject: CardSubject,
    prepared: PreparedCardPayment,
    role: SubjectPaymentRole,
  ): Promise<AttachedCardPayment> {
    const payment = CardPayment.attach({
      id: this.ids.next(),
      subject: PaymentSubject.of(subject.type, subject.id),
      account: PaymentAccount.of(prepared.account),
      providerRef: prepared.providerRef,
      role,
      amountCents: prepared.amountCents,
      at: this.clock.now(),
    });
    await this.payments.save(payment);
    return { paymentId: payment.id, providerRef: prepared.providerRef };
  }

  async release(prepared: PreparedCardPayment): Promise<void> {
    try {
      const provider = this.providers.forAccount(PaymentAccount.of(prepared.account));
      const outcome = await provider.cancelIntent(prepared.providerRef);
      if (outcome.kind !== "cancelled" && outcome.kind !== "already_cancelled") {
        this.logger.warn(
          `Intention orpheline ${prepared.providerRef} non annulée (${outcome.kind}) : ` +
            "elle n'est rattachée à rien et ne sera jamais confirmée.",
        );
      }
    } catch (error) {
      this.logger.error(
        `Intention orpheline ${prepared.providerRef} non annulée.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async retrieve(paymentId: string): Promise<RetrievedCardPayment> {
    const { payment, providerRef } = await this.attached(paymentId);
    const provider = this.providers.forAccount(payment.account);
    const intent = await provider.retrieveIntent(providerRef);
    return {
      paymentId,
      providerRef,
      clientSecret: intent.clientSecret,
      publishableKey: provider.publishableKey(),
      state: intent.state,
    };
  }

  async cancel(paymentId: string): Promise<CardPaymentCancellation> {
    const { payment, providerRef } = await this.attached(paymentId);
    const outcome = await this.providers.forAccount(payment.account).cancelIntent(providerRef);
    if (outcome.kind === "cancelled" || outcome.kind === "already_cancelled") {
      await this.uow.run(() => this.close(paymentId));
    }
    return outcome;
  }

  async settleFromProvider(paymentId: string): Promise<CardProviderSettlement> {
    const { payment, providerRef } = await this.attached(paymentId);
    const intent = await this.providers.forAccount(payment.account).retrieveIntent(providerRef);
    switch (intent.state) {
      case "succeeded":
        // L'identifiant ne sert qu'au journal : l'idempotence tient par la
        // machine de la ligne (`moveTo`, `markPaid`), relue sous verrou.
        await this.uow.run(async () =>
          this.outcomes.paid(
            (await this.attached(paymentId)).payment,
            providerRef,
            `provider-check:${paymentId}`,
          ),
        );
        return "paid";
      case "canceled":
        await this.uow.run(() => this.close(paymentId));
        return "closed";
      case "awaiting_payment":
      case "processing":
        return "pending";
    }
  }

  async adopt(
    subject: CardSubject,
    providerRef: string,
    amountCents: number,
    role: SubjectPaymentRole,
    settled: SubjectSettledState,
  ): Promise<string> {
    const { account } = this.choice.forSubjectType(subject.type);
    const known = await this.payments.findByProviderRef(account, providerRef);
    if (known !== null) {
      return known.id;
    }
    const payment = CardPayment.adopt(
      {
        id: this.ids.next(),
        subject: PaymentSubject.of(subject.type, subject.id),
        account,
        providerRef,
        role,
        amountCents,
        at: this.clock.now(),
      },
      settled,
    );
    if (await this.payments.addIfAbsent(payment)) {
      return payment.id;
    }
    const raced = await this.payments.findByProviderRef(account, providerRef);
    return raced?.id ?? payment.id;
  }

  /** Fermée chez le prestataire : la ligne suit, sauf si un encaissement l'a devancée. */
  private async close(paymentId: string): Promise<void> {
    const locked = await this.payments.load(paymentId);
    if (locked === null || locked.moveTo("closed") !== "transition") {
      return;
    }
    locked.close();
    await this.payments.save(locked);
  }

  private async attached(
    paymentId: string,
  ): Promise<{ readonly payment: CardPayment; readonly providerRef: string }> {
    const payment = await this.payments.load(paymentId);
    if (payment === null || payment.providerRef === null) {
      throw new CardPaymentNotFoundError(paymentId);
    }
    return { payment, providerRef: payment.providerRef };
  }
}
