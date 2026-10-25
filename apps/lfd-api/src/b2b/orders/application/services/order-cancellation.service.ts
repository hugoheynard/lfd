import type { CustomerCancellationStage } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { CommerceOrderCancelledFact } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../../../payments/domain/payment-gateway.js";
import {
  OrderCancellationNotRecordedError,
  OrderCancellationPaymentInProgressError,
  OrderCancellationProviderUnavailableError,
  OrderNotCancellableError,
} from "../../domain/errors/order-cancellation-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderCancelledEvent,
  type CancelledOrderVoucher,
} from "../../domain/events/order-cancelled.event.js";
import {
  CancellationSubjectReader,
  type CancellationSubject,
} from "../../domain/ports/cancellation-subject.reader.js";
import { LoyaltyVoucherRedemption } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderCancellationRepository } from "../../domain/ports/order-cancellation.repository.js";
import { AccountOrderEngagement } from "../../domain/ports/account-order-engagement.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { customerUserOf, staffSheetOf } from "../../domain/services/cancellation-actor.js";
import {
  stageOfAllowance,
  type CancellationAllowance,
} from "../../domain/services/cancellation-allowance.js";
import type { CancellableRegime } from "../../domain/services/order-cancellation.js";
import { CancellationAllowanceGate } from "./cancellation-allowance-gate.js";
import { recordOf, type CancellationIntent } from "./cancellation-intent.js";
import { CancellationRule } from "./cancellation-rule.js";
import { CancellationRefundRequester } from "./cancellation-refund-requester.js";
import { OrderWorkshopWithdrawal } from "./order-workshop-withdrawal.js";
import { VoucherRestitutionRefusal } from "./voucher-restitution-refusal.js";

/**
 * **Le noyau de l'annulation d'une commande** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3 : C3.3 à C3.7 ;
 * extrait du handler staff au lot C6 — `annulation-par-le-client.md`, C6.6 —
 * SANS changer son comportement).
 *
 * Deux handlers l'appellent — l'équipe (`CancelOrderHandler`) et le client
 * (`CancelOrderByCustomerHandler`, invité compris) — et jamais l'un l'autre
 * par le bus. Le client entre par le même chemin, avec moins de droits,
 * jamais plus (décision 1) : son mur et ses deux refus (C6.2, C6.3) sont
 * appliqués AVANT.
 *
 * ## L'ordre des gestes (C3.4 bis)
 *
 * 1. Lire la commande et appliquer la règle (`cancellationOf`) : refus
 *    immédiats, aucun appel.
 * 2. Carte non payée avec une intention : la FERMER chez Stripe, hors
 *    transaction — l'ordre de `AbandonOrderHandler`, sans sa condition
 *    « particulier seulement » : une annulation ferme l'intention de toutes
 *    les clientèles (décision 7). Pas d'appel réseau sous un verrou, et jamais
 *    une annulée encore payable.
 * 3. La transaction (C3.4 ter) : ligne `orders` verrouillée et relue, retrait
 *    au fournil sous le verrou de la journée, écriture conditionnée, bon
 *    restitué et fait durable si — et seulement si — l'écriture a franchi.
 *
 * ## Le bon (lot C3b)
 *
 * La restitution (`reinstate`) rend le bon, refond son reliquat, ou constate
 * qu'il est échu — sous le verrou du titulaire, pris APRÈS la ligne `orders`
 * et la journée. Si le reste du bon a servi ailleurs, ou a été annulé par
 * l'équipe, elle rend `blocked` : le refus qui en sort annule TOUTE la
 * transaction, retrait au fournil compris.
 *
 * ## La transaction qui échoue après Stripe (C3.4 ter)
 *
 * Rejouée UNE fois dans la requête ; la relecture sous `FOR UPDATE` rend le
 * rejeu sûr. Deux échecs : {@link OrderCancellationNotRecordedError} (500), qui
 * dit au staff de relancer — Stripe répondra alors `already_cancelled`. Un
 * REFUS (règle, inscription au fournil) ne se rejoue pas : il dirait la même
 * chose.
 *
 * ## La commande au compte (lot C5)
 *
 * La règle lit aussi l'engagement comptable (facturée, dans un lot, prélevée,
 * rejetée avant), hors verrou puis SOUS le verrou de la ligne `orders` — le
 * même que prennent l'émission mensuelle, la constitution d'un lot et
 * « réglée autrement ». Quand l'écriture franchit, la ligne d'encaissement est
 * FERMÉE (`order_collection` → `cancelled`) dans la même transaction : plus
 * aucun geste comptable ne sait la reprendre. Aucun appel à Stripe.
 *
 * ## La commande payée (lot C4)
 *
 * L'INVERSE de la carte non payée : la base d'abord, Stripe ensuite (C4.3).
 * Aucun appel à Stripe dans la requête ; l'argent à rendre devient une
 * demande persistée, écrite dans la même transaction, et l'exécuteur part
 * après validation. Le rejeu de C3.4 ter ne s'applique pas : Stripe n'a rien
 * fait, un échec de transaction rend une erreur simple.
 *
 * ## Ce qu'il ne fait pas
 *
 * Aucun mur client, aucun réglage : c'est l'affaire de l'appelant.
 *
 * ## Après l'arrêt du plan (plan A1, § 2)
 *
 * Sous l'autorisation `before_packing` — une commande de particulier, réglage
 * « prête » —, une commande de RETRAIT inscrite s'annule : le fournil, puis le
 * colisage, la retirent ({@link OrderWorkshopWithdrawal}). Une livraison
 * inscrite reste refusée (`delivery_after_plan`). Ordre des verrous (§ 2.4) : ligne
 * `orders` → journée → feuille → bac → réserve triée par SKU → BL → bon →
 * remboursement.
 */
@Injectable()
export class OrderCancellation {
  private readonly logger = new Logger(OrderCancellation.name);

  constructor(
    private readonly subjects: CancellationSubjectReader,
    private readonly cancellations: OrderCancellationRepository,
    private readonly payments: PaymentGateway,
    private readonly workshops: OrderWorkshopWithdrawal,
    private readonly vouchers: LoyaltyVoucherRedemption,
    private readonly refusals: VoucherRestitutionRefusal,
    private readonly rule: CancellationRule,
    private readonly allowances: CancellationAllowanceGate,
    private readonly engagements: AccountOrderEngagement,
    private readonly refunds: CancellationRefundRequester,
    private readonly durable: DurablePublisher,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly handovers: OrderHandoverHistoryReader,
  ) {}

  /**
   * Annule, ou refuse sans rien toucher.
   *
   * @throws {OrderNotFoundError} commande inconnue.
   * @throws {OrderNotCancellableError} la règle refuse (avant ou sous verrou).
   * @throws {OrderCancellationPaymentInProgressError} Stripe dit `processing`.
   * @throws {OrderCancellationProviderUnavailableError} Stripe injoignable.
   * @throws {OrderCancellationNotRecordedError} Stripe fermé, écriture ratée deux fois.
   */
  async cancel(orderId: string, intent: CancellationIntent): Promise<void> {
    const subject = await this.subjects.find(orderId);
    if (subject === null) {
      throw new OrderNotFoundError(orderId);
    }
    // Plan A1 (C7 § 4) : l'autorisation, calculée UNE fois pour tout acteur ;
    // la relecture sous verrou applique la même.
    const allowance = await this.allowances.of(subject);
    // La règle, sans verrou : un refus ici n'a rien touché.
    const regime = await this.rule.regimeOf(subject, allowance);
    const intentClosed = await this.closeIntent(subject, regime);
    await this.recordOnce(orderId, intent, allowance, intentClosed);
  }

  /**
   * Ferme l'intention d'une carte non payée. Rend `true` si Stripe a été
   * appelé et confirme qu'elle est morte ; `false` sans appel (total nul, ou
   * carte sans intention : la transaction écrit directement).
   */
  private async closeIntent(
    subject: CancellationSubject,
    regime: CancellableRegime,
  ): Promise<boolean> {
    if (regime !== "due" || subject.stripePaymentIntentId === null) {
      return false;
    }
    const outcome = await this.payments.cancelIntent(subject.stripePaymentIntentId);
    this.ensureIntentDead(outcome, subject);
    return true;
  }

  /** Les cinq issues de `cancelIntent` : deux laissent écrire, trois refusent sans rien toucher. */
  private ensureIntentDead(outcome: IntentCancellation, subject: CancellationSubject): void {
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return;
      case "already_paid":
        // La carte a abouti pendant le clic : l'annulation proposera le
        // remboursement une fois la commande rechargée (C4.6).
        throw new OrderNotCancellableError(subject.orderId, { kind: "paid_just_now" });
      case "in_progress":
        throw new OrderCancellationPaymentInProgressError(subject.orderId);
      case "unavailable":
        this.logger.warn(`Annulation non écrite (commande ${subject.orderId}) : ${outcome.reason}`);
        throw new OrderCancellationProviderUnavailableError(subject.orderId);
    }
  }

  /** La transaction, rejouée une fois si Stripe a déjà fermé l'intention (C3.4 ter). */
  private async recordOnce(
    orderId: string,
    intent: CancellationIntent,
    allowance: CancellationAllowance,
    intentClosed: boolean,
  ): Promise<void> {
    try {
      await this.record(orderId, intent, allowance);
    } catch (first) {
      if (!intentClosed || isRefusal(first)) {
        throw first;
      }
      this.logger.warn(`Annulation rejouée après fermeture Stripe (commande ${orderId})`);
      try {
        await this.record(orderId, intent, allowance);
      } catch (second) {
        if (isRefusal(second)) {
          throw second;
        }
        throw new OrderCancellationNotRecordedError(orderId, second);
      }
    }
  }

  private async record(
    orderId: string,
    intent: CancellationIntent,
    allowance: CancellationAllowance,
  ): Promise<void> {
    await this.unitOfWork.run(async () => {
      const locked = await this.cancellations.lock(orderId);
      if (locked === null) {
        throw new OrderNotFoundError(orderId);
      }
      const regime = await this.rule.regimeOf(locked, allowance);
      await this.ensureNotHandedOver(locked.orderId);
      const afterInscription = await this.workshops.withdraw(locked, allowance, intent.actor);
      const now = this.clock.now();
      const written = await this.cancellations.cancel(
        locked.orderId,
        recordOf(intent, now),
        allowance,
      );
      if (!written) {
        // Sous le verrou, la règle venait de laisser passer : ne pas franchir
        // veut dire un état que le `where` refuse. On le relit pour le nommer,
        // et le refus annule tout, retrait au fournil et au colisage compris
        // (plan A1, § 1 point 5 : `state_changed` si rien ne le nomme mieux).
        const again = (await this.cancellations.lock(locked.orderId)) ?? locked;
        await this.rule.regimeOf(again, allowance);
        throw new OrderNotCancellableError(locked.orderId, { kind: "state_changed" });
      }
      await this.afterCancelled(locked, intent, regime, now, {
        afterInscription,
        stageApplied: stageOfAllowance(allowance),
      });
    });
  }

  /**
   * **Retirée pendant le clic** (C3.6, 2026-10-25). Le comptoir prend la même
   * ligne `orders` avant d'attester : sous ce verrou, une attestation validée
   * se voit ici, alors que le statut `fulfilled` n'arrive au commerce que par
   * le fait durable, plus tard. Régression : les deux gestes passaient.
   */
  private async ensureNotHandedOver(orderId: string): Promise<void> {
    const handed = await this.handovers.ofOrders([orderId]);
    if (handed.has(orderId)) {
      throw new OrderNotCancellableError(orderId, { kind: "fulfilled" });
    }
  }

  /** Le bon restitué et le fait durable — seulement quand l'écriture a franchi. */
  private async afterCancelled(
    locked: CancellationSubject,
    intent: CancellationIntent,
    regime: CancellableRegime,
    now: Date,
    workshop: WorkshopOutcome,
  ): Promise<void> {
    const staffSheet = staffSheetOf(intent.actor);
    if (regime === "account") {
      // Sous le verrou de la ligne `orders`, l'engagement relu était `free` :
      // la ligne d'encaissement est ouverte, on la ferme (C5.4).
      await this.engagements.closeForCancellation(locked.orderId, locked.totalCents, now);
    }
    // Plan E1 : une commande rendue au client par une réouverture porte un BL
    // prévu ; il s'annule avec elle, dans cette transaction.
    await this.deliveryNotes.voidLiveFor(locked.orderId, now);
    const voucher = await this.restitute(locked, now);
    // Lot C4 : APRÈS le bon — un bon qui refuse annule tout, demande comprise.
    const refund =
      regime === "paid" ? await this.refunds.requestFor(locked, staffSheet, now) : null;
    await this.durable.publish(
      new OrderCancelledEvent(
        locked.orderId,
        locked.orderNumber,
        locked.placedByUserId,
        staffSheet,
        intent.reasonText,
        regime,
        voucher,
        refund,
        intent.actor.kind,
        customerUserOf(intent.actor),
        intent.reasonCode,
        intent.policy,
        intent.fromPrincipal ?? null,
        workshop.afterInscription,
        workshop.stageApplied,
      ).durableFact(),
    );
    // La livraison sort la commande de son transfert prévu (lot T2) : même transaction.
    await this.durable.publish(new CommerceOrderCancelledFact(locked.orderId).durableFact());
  }

  /**
   * Le bon de la commande, rendu ou refondu (C3b.5). `already` ne dit rien au
   * fait — il n'a rien fait ; `blocked` refuse, et le refus annule tout.
   */
  private async restitute(
    locked: CancellationSubject,
    now: Date,
  ): Promise<CancelledOrderVoucher | null> {
    if (locked.loyaltyVoucherId === null) {
      return null;
    }
    const restitution = await this.vouchers.reinstate(
      locked.loyaltyVoucherId,
      { id: locked.orderId, number: locked.orderNumber },
      now,
    );
    switch (restitution.kind) {
      case "already":
        return null;
      case "blocked":
        throw new OrderNotCancellableError(
          locked.orderId,
          await this.refusals.blockOf(restitution),
        );
      default:
        return {
          outcome: restitution.kind,
          voucherValueCents: restitution.voucherValueCents,
          remainderValueCents: restitution.remainderValueCents,
          expiresAt: restitution.expiresAt,
        };
    }
  }
}

/** Ce que les ateliers ont fait, et sous quelle étape — recopié au fait (lot A1.3). */
interface WorkshopOutcome {
  readonly afterInscription: boolean;
  readonly stageApplied: CustomerCancellationStage;
}

/** Un refus dit la même chose au second essai : on ne le rejoue pas. */
function isRefusal(error: unknown): boolean {
  return error instanceof DomainError || error instanceof BusinessError;
}
