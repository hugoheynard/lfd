import { Injectable, Logger } from "@nestjs/common";

import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { CardPaymentFailedFact, CardPaymentSettledFact } from "../../channels/facts/index.js";
import { SubjectSettlements, type SubjectSettlement } from "../../channels/subjects/index.js";
import type { CardPayment } from "../domain/entities/card-payment.js";
import {
  CardPaymentNotFoundError,
  NoSubjectSettlementError,
} from "../domain/errors/card-payment-errors.js";
import { CardPaymentRepository } from "../domain/ports/card-payment.repository.js";
import { LinkPaymentNotice } from "../domain/ports/link-payment-notice.js";
import { factSubjectOf, subjectOf } from "./payment-facts.js";

/**
 * **Applique l'issue d'une intention** — encaissée ou refusée — dans l'ordre
 * du §3.6 (plan M2), sous l'unité de travail du webhook qu'il rejoint :
 *
 * 1. un événement **périmé** (déjà encaissé ; refusé après encaissement ou
 *    fermeture ; refus rejoué) est ignoré et journalisé — jamais refusé :
 *    le prestataire rejouerait trois jours (§3.4) ;
 * 2. le **canal** d'abord : le sujet prend SON verrou, pose sa vue, publie
 *    ses faits au franchissement ;
 * 3. la ligne **relue sous verrou**, puis écrite — l'issue n'est jamais
 *    tirée d'une lecture d'avant l'appel ;
 * 4. le **fait durable** de `card-payment`, avec l'issue du canal ;
 * 5. pour un paiement venu d'un lien, l'**avis à l'équipe** (§2.4 du plan
 *    des liens) — seulement quand la ligne vient de passer encaissée : un
 *    webhook rejoué n'avise pas deux fois.
 *
 * Une transaction, un ordre.
 */

/**
 * Ce que l'enregistrement d'un encaissement a fait — le webhook l'ignore, la
 * relecture chez le prestataire le compte : `replayed` quand la ligne était
 * déjà payée (relue avant le canal, ou sous verrou après lui),
 * `refused_by_subject` quand le sujet n'en veut pas, `settled` sinon.
 */
export type PaidRecording = "settled" | "replayed" | "refused_by_subject";

@Injectable()
export class IntentOutcomeRecorder {
  private readonly logger = new Logger(IntentOutcomeRecorder.name);

  constructor(
    private readonly payments: CardPaymentRepository,
    private readonly settlements: SubjectSettlements,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly linkNotice: LinkPaymentNotice,
  ) {}

  async paid(payment: CardPayment, providerRef: string, eventId: string): Promise<PaidRecording> {
    if (payment.moveTo("paid") === "replay") {
      this.ignoreStale(payment, "paid", eventId);
      return "replayed";
    }
    const outcome = await this.settlementOf(payment).onPaid(
      subjectOf(payment),
      payment.id,
      payment.amountCents,
      // Le rôle lu sur la ligne (plan S2, §2.5) : le sujet route sur lui.
      payment.role,
    );
    const locked = await this.lock(payment.id);
    const paidAt = this.clock.now();
    if (!locked.markPaid(paidAt)) {
      return "replayed";
    }
    await this.payments.save(locked);
    await this.durable.publish(
      new CardPaymentSettledFact(factSubjectOf(locked, providerRef), outcome, paidAt).durableFact(),
    );
    if (locked.payLinkId !== null) {
      await this.linkNotice.paid({
        paymentId: locked.id,
        payLinkId: locked.payLinkId,
        subjectType: locked.subject.type,
        subjectId: locked.subject.id,
        account: locked.account.name,
        amountCents: locked.amountCents,
        refused: outcome === "refused",
      });
    }
    return outcome === "refused" ? "refused_by_subject" : "settled";
  }

  async failed(payment: CardPayment, providerRef: string, eventId: string): Promise<void> {
    if (payment.moveTo("failed") !== "transition") {
      this.ignoreStale(payment, "failed", eventId);
      return;
    }
    await this.settlementOf(payment).onPaymentFailed(subjectOf(payment), payment.id, payment.role);
    const locked = await this.lock(payment.id);
    if (locked.moveTo("failed") !== "transition") {
      return;
    }
    locked.markFailed();
    await this.payments.save(locked);
    await this.durable.publish(
      new CardPaymentFailedFact(factSubjectOf(locked, providerRef)).durableFact(),
    );
  }

  private settlementOf(payment: CardPayment): SubjectSettlement {
    const settlement = this.settlements.forType(payment.subject.type);
    if (settlement === null) {
      throw new NoSubjectSettlementError(payment.subject.type);
    }
    return settlement;
  }

  private async lock(paymentId: string): Promise<CardPayment> {
    const locked = await this.payments.load(paymentId);
    if (locked === null) {
      throw new CardPaymentNotFoundError(paymentId);
    }
    return locked;
  }

  private ignoreStale(payment: CardPayment, target: string, eventId: string): void {
    this.logger.log(
      `Événement ${eventId} périmé ignoré : le paiement ${payment.id} est « ${payment.state} », ` +
        `l'événement le dit « ${target} ».`,
    );
  }
}
