import { cartAdjustmentCents, type DeliveryVatMode } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Order, type DraftOrderInput } from "../../domain/entities/order.js";
import {
  type OrderRevisionToSave,
  type RevisableOrder,
  type RevisionActor,
  ensureNoShortfallDecision,
} from "../../domain/entities/order-revision.js";
import {
  OrderWithoutSalesTermsError,
  RevisionIntoClosedDayError,
  standingRevisionErrorOf,
} from "../../domain/errors/order-revision-errors.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import type { WindowRequester } from "../../domain/services/delivery-window.js";
import { BEFORE_INSCRIPTION } from "../../domain/services/cancellation-allowance.js";
import { cancellationOf } from "../../domain/services/order-cancellation.js";
import {
  quantitiesAfterArrestAllowed,
  type RevisionScope,
} from "../../domain/services/revision-after-arrest.js";
import {
  revisabilityOf,
  standingBlockOf,
  type RevisionVerdict,
  type StandingRevisionBlock,
} from "../../domain/services/order-revisability.js";
import { OrderLocale } from "../../domain/value-objects/order-locale.js";
import { CancellationRule } from "./cancellation-rule.js";
import { OrderComposition, type ComposedDraft } from "./order-composition.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderCutoffGate } from "./order-cutoff-gate.service.js";
import type { OrderParties } from "./order-parties.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";

/**
 * **Recomposer une commande passée** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) — partagé par
 * la modification et par son devis, qui disent donc le même montant.
 *
 * Le calcul est celui de la passation ({@link OrderComposition}) ; ce service
 * n'ajoute que ce qui n'appartient qu'à la révision :
 *
 * - **R1** : la même frontière que l'annulation (`cancellationOf`) pour tous,
 *   et l'heure limite de l'ancienne ET de la nouvelle date pour le client —
 *   jamais pour l'équipe, ni dérogation dépensée ;
 * - **R2** : payeur, société, principal, clientèle, CGV et langue relus sur la
 *   commande, jamais recalculés ;
 * - **R3** : les lignes déjà présentes à leur prix figé ;
 * - **R4** : la surtaxe d'origine, recalculée sur son ajustement figé ; le bon
 *   déjà imputé, borné par l'agrégat ;
 * - **R5** : la nouvelle journée ouverte.
 */
@Injectable()
export class OrderRevising {
  constructor(
    private readonly composition: OrderComposition,
    private readonly cutoffs: OrderCutoffGate,
    private readonly plans: OrderPlanGate,
    private readonly rule: CancellationRule,
  ) {}

  /**
   * R1 : la même frontière que l'annulation — annulée, prête, retirée,
   * engagée en comptabilité, remboursement en vol. Hors verrou pour refuser
   * tôt, sous verrou pour faire foi. « Inscrite » se tranche au guichet du
   * fournil, sous le verrou de la journée.
   *
   * Puis M1 : une commande payable par carte ne se modifie pas (§9) —
   * l'agrégat le refuse aussi, mais après une recomposition inutile. Puis les
   * CGV figées, sans lesquelles rien ne se recompose.
   *
   * Plan A2 (§ 7) : une commande que son statut dit déjà inscrite
   * (`confirmed`) n'est pas refusée pour l'équipe sur une commande au compte —
   * la portée devient `quantities`, que l'appelant fait respecter.
   *
   * @returns la portée : `full`, ou `quantities` si la commande est déjà inscrite.
   * @throws {OrderNotRevisableError} la commande ne se modifie plus.
   * @throws {CardOrderNotRevisableError} la commande se règle par carte.
   * @throws {OrderWithoutSalesTermsError} une commande d'avant les CGV figées.
   */
  async ensureRevisable(
    order: RevisableOrder,
    actorKind: RevisionActor["kind"],
  ): Promise<RevisionScope> {
    // La règle est celle de l'agrégat ; rejouée ici sous le verrou de `orders`
    // que `OrderRevisionRepository.lock` vient de poser (E6b).
    ensureNoShortfallDecision(order);
    const standing = await this.standingOf(order, null, actorKind);
    if (standing.block !== null) {
      throw standingRevisionErrorOf(order.orderId, standing.block);
    }
    return standing.scope;
  }

  /**
   * **Ce que les vues disent de la modification** (§6) — la MÊME règle que le
   * geste, sans verrou : la frontière commune ({@link ensureRevisable}, avec
   * le jour d'inscription lu au fournil), puis pour le client l'arrêt du plan
   * et l'heure limite de la date actuelle, décidés comme {@link compose} les
   * oppose. Une indication : le `POST` relit tout.
   */
  async revisabilityOf(
    order: RevisableOrder,
    actorKind: RevisionActor["kind"],
    inscribedDay: string | null,
  ): Promise<RevisionVerdict> {
    const { block: standing, scope } = await this.standingOf(order, inscribedDay, actorKind);
    if (standing === null && scope === "quantities") {
      return { revisable: true, until: null, quantitiesOnly: true };
    }
    if (standing !== null || actorKind === "staff" || order.serviceDay === null) {
      return revisabilityOf({ standing, planClosedDay: null, cutoff: null });
    }
    const day = order.serviceDay;
    const [closed, cutoff] = await Promise.all([
      this.plans.isClosed(day),
      this.cutoffs.decide(
        order.lines.map((line) => line.sku),
        day,
      ),
    ]);
    return revisabilityOf({ standing, planClosedDay: closed ? day : null, cutoff });
  }

  /**
   * La frontière commune, et la portée. « Inscrite » est le DERNIER refus que
   * la règle cherche (`cancellationOf`) : quand c'est lui, tout le reste est
   * passé, et l'équipe d'une commande au compte garde les quantités (plan A2,
   * § 7) — le guichet du fournil le tranche sous le verrou de la journée.
   */
  private async standingOf(
    order: RevisableOrder,
    inscribedDay: string | null,
    actorKind: RevisionActor["kind"],
  ): Promise<{ readonly block: StandingRevisionBlock | null; readonly scope: RevisionScope }> {
    const decision = cancellationOf(
      await this.rule.stateOf(subjectOf(order), inscribedDay),
      // Une modification s'arrête à l'inscription, quel que soit le réglage
      // d'annulation du plan A1 : elle change ce qu'on fabrique. Au-delà, c'est
      // la portée `quantities` (plan A2), propre à la révision.
      BEFORE_INSCRIPTION,
    );
    const quantities =
      !decision.cancellable &&
      decision.block.kind === "inscribed" &&
      quantitiesAfterArrestAllowed(actorKind, order.paymentStatus, order.totalCents);
    const block = standingBlockOf(
      quantities ? { cancellable: true, regime: "account" } : decision,
      {
        paymentStatus: order.paymentStatus,
        totalCents: order.totalCents,
        hasSalesTerms: order.salesTerms !== null,
      },
    );
    return { block, scope: quantities ? "quantities" : "full" };
  }

  /**
   * La commande telle qu'elle serait. `requireChange` : la modification exige
   * un changement (R6) ; le devis, non — il montre aussi le panier intact.
   *
   * `rulesOf` : les règles de qui s'appliquent, par défaut celles de l'auteur.
   * Le devis d'une DEMANDE (M4, décision de Hugo du 2026-10-23) chiffre la
   * commande voulue par le client avec les règles de l'équipe, parce que
   * c'est l'équipe qui l'appliquera (`ReviseOrderCommand` en son nom).
   */
  async compose(
    order: RevisableOrder,
    content: OrderContent,
    author: RevisionActor,
    options: { readonly requireChange: boolean; readonly rulesOf?: RevisionActor["kind"] },
  ): Promise<OrderRevisionToSave> {
    const actor = options.rulesOf ?? author.kind;
    await this.ensureDayOpen(order, content.requestedDeliveryDate, actor);
    const parties: OrderParties = {
      companyId: order.companyId,
      placedByUserId: order.placedByUserId,
      placedByStaffId: order.placedByStaffId,
    };
    const resolved = await this.composition.resolve(content, parties, order.lines);
    await this.ensureBeforeCutoff(order, content, actor);
    const arranged = await this.composition.arrange(
      content,
      parties,
      resolved,
      requesterOf(order, actor),
    );
    const input = draftInputOf(order, OrderComposition.draftOf(content, resolved, arranged), {
      deliveryVatMode: arranged.deliveryVatMode,
      subtotalCents: resolved.subtotalCents,
    });
    return options.requireChange ? Order.revise(order, input) : Order.recompose(order, input);
  }

  /**
   * **Sous le verrou** des journées (après le guichet du fournil) : la
   * nouvelle journée n'a pas été arrêtée depuis la composition.
   *
   * @throws {RevisionIntoClosedDayError} la commande changerait pour une journée arrêtée.
   * @throws {ProductionPlanClosedError} le client modifie une commande d'une journée arrêtée.
   */
  async holdDay(revision: OrderRevisionToSave, actor: RevisionActor): Promise<void> {
    if (revision.serviceDay === null || !(await this.plans.hold(revision.serviceDay))) {
      return;
    }
    if (revision.serviceDay !== revision.previousServiceDay) {
      throw new RevisionIntoClosedDayError(revision.serviceDay);
    }
    if (actor.kind === "customer") {
      throw new ProductionPlanClosedError(revision.serviceDay);
    }
  }

  /**
   * R5, hors verrou. Une date qui CHANGE vise une journée ouverte et pas trop
   * proche ; une date inchangée sur une journée arrêtée reste à l'équipe — c'est
   * une commande reçue « hors plan », que le retirage reprendra.
   */
  private async ensureDayOpen(
    order: RevisableOrder,
    day: string | null,
    actor: RevisionActor["kind"],
  ): Promise<void> {
    const closed = await this.plans.isClosed(day);
    if (day !== order.serviceDay) {
      if (closed && day !== null) {
        throw new RevisionIntoClosedDayError(day);
      }
      await this.plans.ensureNotTooSoon(day);
      return;
    }
    if (closed && actor === "customer") {
      throw new ProductionPlanClosedError(day ?? "");
    }
  }

  /**
   * R1 client : l'heure limite de l'ancienne date ET de la nouvelle, sur tous
   * les articles des deux compositions. L'équipe n'y est pas soumise ; aucune
   * dérogation ne se dépense (R4 : pas de surtaxe créée).
   */
  private async ensureBeforeCutoff(
    order: RevisableOrder,
    content: OrderContent,
    actor: RevisionActor["kind"],
  ): Promise<void> {
    if (actor === "staff") {
      return;
    }
    const skus = [
      ...new Set([...order.lines.map((line) => line.sku), ...content.lines.map((l) => l.sku)]),
    ];
    const days = new Set([order.serviceDay, content.requestedDeliveryDate]);
    for (const day of days) {
      if (day !== null) {
        await this.cutoffs.ensure(skus, day, order.companyId, { withWaiver: false });
      }
    }
  }
}

/**
 * L'entrée de l'agrégat : la composition du jour, et tout ce que la révision
 * relit sur la commande sans le recalculer (R2, R4).
 *
 * @throws {OrderWithoutSalesTermsError} une commande d'avant les CGV figées.
 */
function draftInputOf(
  order: RevisableOrder,
  composed: ComposedDraft,
  current: { readonly deliveryVatMode: DeliveryVatMode; readonly subtotalCents: number },
): DraftOrderInput {
  const salesTerms = order.salesTerms;
  if (salesTerms === null) {
    throw new OrderWithoutSalesTermsError(order.orderId);
  }
  return {
    ...composed,
    // V3 : la TVA du port se recalcule, mais selon le mode figé à la passation.
    deliveryVatMode: order.deliveryVatMode ?? current.deliveryVatMode,
    companyId: order.companyId,
    billedCompanyId: order.billedCompanyId,
    principal: order.principal,
    placedByUserId: order.placedByUserId,
    placedByStaffId: order.placedByStaffId,
    catalogVersionId: order.catalogVersionId,
    // R4 : la surtaxe de la passation, ni créée ni retirée — son ajustement
    // figé appliqué au nouveau sous-total, comme l'agrégat le vérifie.
    lateFeeCents:
      order.lateFeeAdjustment === null
        ? 0
        : cartAdjustmentCents(order.lateFeeAdjustment.adjustment, current.subtotalCents),
    lateFeeAdjustment: order.lateFeeAdjustment,
    // Le bon garde la part déjà déduite : l'agrégat la borne au nouveau total,
    // et la révision refuse qu'elle baisse (§9).
    voucher:
      order.voucher === null
        ? null
        : { id: order.voucher.id, valueCents: order.voucher.appliedCents },
    salesTerms,
    locale: order.locale === null ? null : OrderLocale.of(order.locale),
  };
}

/** L'état que la règle de l'annulation lit, tiré de la commande. */
function subjectOf(order: RevisableOrder) {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    placedByUserId: order.placedByUserId,
    companyId: order.companyId,
    fulfillmentMethod: order.fulfillment.method,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
    serviceDay: order.serviceDay,
    cancelledAt: order.cancelledAt,
    stripePaymentIntentId: order.stripePaymentIntentId,
    loyaltyVoucherId: order.voucher?.id ?? null,
    refunds: order.refunds,
  };
}

/** Qui demande une tranche : l'équipe est libre de l'heure, le client selon sa clientèle. */
function requesterOf(order: RevisableOrder, actor: RevisionActor["kind"]): WindowRequester {
  if (actor === "staff") {
    return "staff";
  }
  return order.companyId === null ? "individual" : "pro";
}
