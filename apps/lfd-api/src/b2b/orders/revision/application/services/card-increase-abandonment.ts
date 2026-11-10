import { Injectable } from "@nestjs/common";

import { CardPayments } from "../../../../../card-payment/channels/requests/index.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { Clock } from "../../../../../platform/time/clock.js";
import type {
  CardIncreaseAbandonCause,
  CardIncreaseProposal,
} from "../../domain/entities/card-increase-proposal.js";
import type { RevisionActor } from "../../domain/entities/order-revision.js";
import {
  CardComplementCancellationUnavailableError,
  CardComplementJustPaidError,
  RevisionProposalPendingError,
} from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { increaseAbandonedFact, type IncreaseOrderLabel } from "./card-increase-facts.js";

/**
 * **Abandonner un projet de hausse qui attend son paiement** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3 étapes 2 et 4, §2.7.4) — partagé par le remplacement (une nouvelle hausse du même
 * auteur) et par « Abandonner » (le client, l'équipe).
 *
 * Toujours en deux temps, jamais l'appel au prestataire sous un verrou :
 *
 * 1. HORS transaction, l'intention est annulée chez le prestataire
 *    (`cards.cancel`) — et chacune de ses cinq issues dit la suite ;
 * 2. SOUS le verrou de la commande (posé par l'appelant), le projet relu
 *    `FOR UPDATE` passe `abandoned` par une écriture **conditionnée** — un
 *    projet devenu `ready` entre-temps n'est pas touché, et le refus le dit.
 *    La cause part au journal (R12), jamais en colonne.
 */
@Injectable()
export class CardIncreaseAbandonment {
  constructor(
    private readonly reader: CardIncreaseProposalReader,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly cards: CardPayments,
    private readonly journal: Journal,
    private readonly clock: Clock,
  ) {}

  /**
   * **Avant une nouvelle hausse** (§2.4, étape 2 ; R5), hors transaction : le
   * projet vivant de la commande, s'il y en a un, n'est remplacé que s'il
   * attend son paiement ET vient du même auteur — son intention est alors
   * annulée, et il est rendu pour être abandonné sous le verrou.
   *
   * @returns le projet à abandonner sous le verrou, ou `null`.
   * @throws {RevisionProposalPendingError} un autre auteur attend son paiement, ou un complément payé attend.
   * @throws {CardComplementJustPaidError} le complément précédent vient d'être payé.
   * @throws {CardComplementCancellationUnavailableError} le prestataire ne répond pas.
   */
  async releaseForReplacement(
    orderId: string,
    author: RevisionActor,
  ): Promise<CardIncreaseProposal | null> {
    const live = await this.reader.liveOf(orderId);
    if (live === null) {
      return null;
    }
    const state = live.toPersistence();
    if (state.state !== "awaiting_payment" || !sameAuthor(state.author, author)) {
      throw new RevisionProposalPendingError(orderId, state.state);
    }
    await this.cancelIntent(live);
    return live;
  }

  /**
   * Annule l'intention du projet chez le prestataire. 🔴 HORS transaction.
   *
   * @throws {CardComplementJustPaidError} déjà payée, ou un paiement en cours.
   * @throws {CardComplementCancellationUnavailableError} le prestataire ne répond pas.
   */
  async cancelIntent(proposal: CardIncreaseProposal): Promise<void> {
    const { orderId, paymentId } = proposal.toPersistence();
    const outcome = await this.cards.cancel(paymentId);
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return;
      case "already_paid":
      case "in_progress":
        throw new CardComplementJustPaidError(orderId);
      case "unavailable":
        throw new CardComplementCancellationUnavailableError(orderId);
    }
  }

  /**
   * **Sous le verrou de la commande**, le remplacement (§2.4, étape 4) : le
   * projet vivant relu doit être celui qu'on vient de libérer — un autre
   * (ouvert entre-temps) refuse ; aucun ne passe.
   *
   * @throws {RevisionProposalPendingError} un autre projet vivant occupe la commande.
   * @throws {CardComplementJustPaidError} le projet libéré est passé `ready` entre-temps.
   */
  async replaceLocked(
    released: CardIncreaseProposal | null,
    order: IncreaseOrderLabel,
  ): Promise<void> {
    const live = await this.proposals.lockLiveOf(order.orderId);
    if (live === null) {
      // Abandonné entre-temps (le délai) : la place est libre.
      return;
    }
    if (released === null || live.id !== released.id) {
      throw new RevisionProposalPendingError(order.orderId, live.state);
    }
    await this.abandonLive(live, order, "replaced");
  }

  /**
   * **Sous le verrou de la commande**, « Abandonner » (§2.5) : le projet dont
   * l'intention vient d'être annulée. Déjà sorti (le délai), ou remplacé :
   * rien à faire.
   *
   * @throws {CardComplementJustPaidError} le projet est passé `ready` entre-temps.
   */
  async abandonLocked(
    released: CardIncreaseProposal,
    order: IncreaseOrderLabel,
    cause: CardIncreaseAbandonCause,
  ): Promise<void> {
    const live = await this.proposals.lockLiveOf(order.orderId);
    if (live === null || live.id !== released.id) {
      return;
    }
    await this.abandonLive(live, order, cause);
  }

  private async abandonLive(
    live: CardIncreaseProposal,
    order: IncreaseOrderLabel,
    cause: CardIncreaseAbandonCause,
  ): Promise<void> {
    if (live.state !== "awaiting_payment") {
      throw new CardComplementJustPaidError(order.orderId);
    }
    live.abandon(this.clock.now());
    if (!(await this.proposals.save(live))) {
      // La condition `awaiting_payment` n'a rien trouvé : le paiement est passé.
      throw new CardComplementJustPaidError(order.orderId);
    }
    await this.journal.append(increaseAbandonedFact(live, order, cause));
  }
}

function sameAuthor(left: RevisionActor, right: RevisionActor): boolean {
  if (left.kind === "customer" && right.kind === "customer") {
    return left.userId === right.userId;
  }
  return left.kind === "staff" && right.kind === "staff" && left.staffId === right.staffId;
}
