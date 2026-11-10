import { Injectable } from "@nestjs/common";

import {
  type CardSubject,
  type SubjectSettlement,
  SubjectSettlements,
} from "../../channels/subjects/index.js";
import type { CardRefundLedger } from "../../domain/entities/card-refund-ledger.js";
import { NoSubjectSettlementError } from "../../domain/errors/card-payment-errors.js";
import { CardRefundLedgerRepository } from "../../domain/ports/card-refund-ledger.repository.js";
import type { PaymentSubject } from "../../domain/value-objects/payment-subject.js";

/** L'argent d'un paiement, verrouillé dans l'ordre du §3.6 : le sujet, puis la ligne. */
export interface LockedPayment {
  readonly subject: CardSubject;
  readonly settlement: SubjectSettlement;
  readonly ledger: CardRefundLedger;
}

/** Le sujet d'un paiement, tel que le canal le reçoit. */
export function cardSubjectOf(subject: PaymentSubject): CardSubject {
  return { type: subject.type, id: subject.id };
}

/**
 * **L'ordre unique des verrous** (plan M2, §3.6, v9) : toute écriture de
 * `card-payment` sur l'argent d'un sujet passe par ici — le constat,
 * l'exécuteur, « Relancer », « rendu autrement », les demandes. D'abord
 * `lockSubject` (le sujet prend SON `FOR UPDATE`), puis la ligne `payment`
 * (`FOR UPDATE`, avec le carnet). Les demandes se relisent APRÈS, sous ces
 * deux verrous. À appeler dans une unité de travail.
 */
@Injectable()
export class CardRefundScope {
  constructor(
    private readonly ledgers: CardRefundLedgerRepository,
    private readonly settlements: SubjectSettlements,
  ) {}

  /** `null` : aucun paiement sous cet identifiant. */
  async lock(paymentId: string): Promise<LockedPayment | null> {
    const found = await this.ledgers.subjectOf(paymentId);
    if (found === null) {
      return null;
    }
    const subject = cardSubjectOf(found);
    const settlement = this.settlementOf(subject.type);
    await settlement.lockSubject(subject);
    const ledger = await this.ledgers.loadByPayment(paymentId);
    return ledger === null ? null : { subject, settlement, ledger };
  }

  /** @throws {NoSubjectSettlementError} aucun bloc n'implémente ce type de sujet. */
  settlementOf(subjectType: string): SubjectSettlement {
    const settlement = this.settlements.forType(subjectType);
    if (settlement === null) {
      throw new NoSubjectSettlementError(subjectType);
    }
    return settlement;
  }
}
