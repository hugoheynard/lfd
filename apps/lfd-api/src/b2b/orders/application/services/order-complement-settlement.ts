import { Injectable } from "@nestjs/common";

import type {
  CardSubject,
  SubjectPaidOutcome,
} from "../../../../card-payment/channels/subjects/index.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { ComplementWithoutProposalError } from "../../domain/errors/card-increase-proposal-errors.js";
import { OrderComplementPaidLateEvent } from "../../domain/events/order-complement-paid-late.event.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { CardIncreaseWake } from "../../domain/ports/card-increase-wake.js";
import { OrderCardStandingReader } from "../../domain/ports/order-card-standing.reader.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import {
  increaseClosedFact,
  increasePaidFact,
  type IncreaseOrderLabel,
} from "./card-increase-facts.js";

/**
 * **Un complément de hausse est encaissé** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) — la
 * branche `complement` de `OrderSubjectSettlement.onPaid`, dans la
 * transaction du webhook.
 *
 * L'ordre des verrous (§2.3) : `orders`, puis le projet par son paiement. La
 * commande n'est JAMAIS touchée ici — ni `markPaid`, ni total : seul le
 * projet bouge, et l'exécuteur (S2.c) écrira la modification.
 *
 * - `awaiting_payment` ⇒ `ready`, réveil de l'exécuteur après validation ;
 * - `abandoned` ⇒ `closed`, fait durable `order.complement_paid_late` — le
 *   remboursement part après validation, jamais ici (R8) ;
 * - autre état ⇒ rejeu, rien ne franchit ;
 * - aucun projet ⇒ erreur bruyante.
 *
 * Chaque transition écrite part au journal dans la même transaction (R12) :
 * `order.card_increase_paid`, `order.card_increase_closed`.
 */
@Injectable()
export class OrderComplementSettlement {
  constructor(
    private readonly lock: OrderLock,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly durable: DurablePublisher,
    private readonly afterCommit: AfterCommit,
    private readonly wake: CardIncreaseWake,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly standings: OrderCardStandingReader,
  ) {}

  /** @throws {ComplementWithoutProposalError} aucun projet de cette commande ne porte ce paiement. */
  async onPaid(subject: CardSubject, paymentId: string): Promise<SubjectPaidOutcome> {
    await this.lock.lock(subject.id);
    const proposal = await this.proposals.lockByPayment(paymentId);
    if (proposal === null || proposal.toPersistence().orderId !== subject.id) {
      throw new ComplementWithoutProposalError(subject.id, paymentId);
    }
    switch (proposal.state) {
      case "awaiting_payment":
        return this.ready(proposal);
      case "abandoned":
        return this.closeLate(proposal);
      default:
        return "already_applied";
    }
  }

  private async ready(proposal: CardIncreaseProposal): Promise<SubjectPaidOutcome> {
    proposal.markPaid(this.clock.now());
    if (!(await this.proposals.save(proposal))) {
      return "already_applied";
    }
    await this.journal.append(increasePaidFact(proposal, await this.labelOf(proposal)));
    const id = proposal.id;
    this.afterCommit.defer(() => this.wake.wake(id), `card-increase.wake:${id}`);
    return "applied";
  }

  private async closeLate(proposal: CardIncreaseProposal): Promise<SubjectPaidOutcome> {
    proposal.closeLatePayment(this.clock.now());
    if (!(await this.proposals.save(proposal))) {
      return "already_applied";
    }
    await this.journal.append(increaseClosedFact(proposal, await this.labelOf(proposal)));
    const state = proposal.toPersistence();
    await this.durable.publish(
      new OrderComplementPaidLateEvent(
        state.orderId,
        state.id,
        state.paymentId,
        state.complementCents,
      ).durableFact(),
    );
    return "refused";
  }

  /**
   * Le numéro de la commande, libellé des faits.
   * @throws {OrderNotFoundError} la commande verrouillée a disparu — la base et le code divergent.
   */
  private async labelOf(proposal: CardIncreaseProposal): Promise<IncreaseOrderLabel> {
    const orderId = proposal.toPersistence().orderId;
    const standing = await this.standings.ofOrder(orderId);
    if (standing === null) {
      throw new OrderNotFoundError(orderId);
    }
    return { orderId, orderNumber: standing.orderNumber };
  }
}
