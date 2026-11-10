import type { CustomerAudience } from "@lfd/contracts";
import type { Instant } from "../../../../platform/context/request-context.js";
import { Injectable, Logger } from "@nestjs/common";

import { sameDayDoorOf } from "../../../order-cutoffs/domain/same-day-doors.js";
import { Order } from "../../domain/entities/order.js";
import type { PricedDraftInput } from "../../domain/entities/order-priced-draft.js";
import {
  type OrderRevisionToSave,
  type RevisableOrder,
  type RevisionActor,
  ensureNoShortfallDecision,
} from "../../domain/entities/order-revision.js";
import { cardRefusalOf } from "../../domain/entities/revision-settlement.js";
import {
  CardOrderNotRevisableError,
  OrderWithoutSalesTermsError,
  RevisionIntoClosedDayError,
  standingRevisionErrorOf,
} from "../../domain/errors/order-revision-errors.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import { windowRequesterOf } from "../../domain/services/delivery-window.js";
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
import { audienceOfSalesTerms } from "../../domain/services/sales-terms-of.js";
import { OrderLocale } from "../../domain/value-objects/order-locale.js";
import { warnBeyondCap } from "./basket-promotions.service.js";
import { CancellationRule } from "./cancellation-rule.js";
import { revisionPriceErrorOf } from "../../domain/errors/revision-price-errors.js";
import { replayableDiscountsOf } from "../../domain/services/basket-discount-replay.js";
import {
  OrderComposition,
  type ComposedDraft,
  type RevisionPriceRefusal,
} from "./order-composition.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderCutoffGate } from "./order-cutoff-gate.service.js";
import { OrderIntake } from "./order-intake.service.js";
import type { OrderParties } from "./order-parties.js";
import { OrderPlanGate } from "./order-plan-gate.service.js";
import type { FrozenDeliveryFee } from "./pricing-context.service.js";
import { ShelfRevising } from "./shelf-revising.service.js";

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
 *   commande, jamais recalculés — la clientèle se lit sur les CGV figées
 *   (`salesTermsPro` ⇒ pro), et c'est elle qui ouvre ou ferme le point de
 *   retrait et la livraison (É13, Hugo, 2026-11-03), pas le statut de la
 *   société aujourd'hui. Le prix d'une ligne NOUVELLE, lui, se résout encore
 *   au statut d'aujourd'hui (la porte du prix) ;
 * - **R3** : les lignes déjà présentes à leur prix figé — et une quantité
 *   qui changerait ce prix est refusée, comme une remise de panier qui
 *   tomberait sous son seuil ; les remises sont REJOUÉES, jamais rejugées
 *   (`documentation/promotions/plan-remises-acquises.md`, § 10) ;
 * - **R4** : la surtaxe d'origine, recalculée sur son ajustement figé ; le bon
 *   déjà imputé, borné par l'agrégat ;
 * - **R5** : la nouvelle journée ouverte — et, pour le client, pas avant le
 *   premier jour commandable de sa clientèle (2026-10-28).
 */
@Injectable()
export class OrderRevising {
  private readonly logger = new Logger(OrderRevising.name);

  constructor(
    private readonly composition: OrderComposition,
    private readonly cutoffs: OrderCutoffGate,
    private readonly plans: OrderPlanGate,
    private readonly rule: CancellationRule,
    private readonly intake: OrderIntake,
    private readonly shelf: ShelfRevising,
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
    if (standing === null && order.supply === "shelf") {
      // Sur la vitrine, les gardes du circuit, pour l'équipe aussi (lot L5).
      return this.shelf.verdictOf(order, actorKind);
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
    options: RevisionOptions,
  ): Promise<OrderRevisionToSave> {
    const { revision, refusals } = await this.quote(order, content, author, options);
    const [first] = refusals;
    if (first !== undefined) {
      throw revisionPriceErrorOf(first);
    }
    return revision;
  }

  /**
   * **Le devis** (plan des remises acquises, § 10.4) : la même recomposition,
   * mais un prix de ligne qui changerait ou une remise qui tomberait sous son
   * seuil n'y lève pas — il est rendu, par ligne et par remise, et la ligne
   * refusée est chiffrée à son prix figé. {@link compose} lève le premier.
   */
  async quote(
    order: RevisableOrder,
    content: OrderContent,
    author: RevisionActor,
    options: RevisionOptions,
  ): Promise<QuotedRevision> {
    const actor = options.rulesOf ?? author.kind;
    // Une commande sur stock n'a ni plan ni heure limite : les gardes du
    // circuit les remplacent (plan du jour J, §13, lot L5).
    const fromShelf = order.supply === "shelf";
    if (fromShelf) {
      await this.shelf.ensureOpen(order, actor);
    } else {
      await this.ensureDayOpen(order, content.requestedDeliveryDate, actor, options.decidedAt);
      await this.ensureFirstOrderableDay(
        order,
        content.requestedDeliveryDate,
        actor,
        options.decidedAt,
      );
    }
    const parties: OrderParties = {
      companyId: order.companyId,
      placedByUserId: order.placedByUserId,
      placedByStaffId: order.placedByStaffId,
      buyerKind: order.buyerKind,
    };
    const loaded = await this.composition.load({
      content,
      parties,
      revised: { lines: order.lines, discounts: replayableDiscountsOf(order) },
      // Sans effet en révision : ses lignes passent `priceRevisedLines`.
      caller: "checkout",
      // La méthode et le mode du port RELUS sur la commande (plan du centime,
      // § 5 ; V3, É9) : la composition chiffre dans l'unité de la commande,
      // avec le mode que l'agrégat appliquera.
      vatMethod: order.vatMethod,
      frozenDeliveryVatMode: order.deliveryVatMode,
      // R2 : la clientèle de la COMMANDE, lue sur ses CGV figées (É13, Hugo,
      // 2026-11-03) — jamais le statut de la société aujourd'hui.
      frozenAudience: frozenAudienceOf(order),
      // Le tarif de livraison du jour de la passation (1a, Hugo, 2026-11-05) :
      // un frais relevé depuis ne renchérit pas la commande.
      frozenDeliveryFee: frozenDeliveryFeeOf(order),
    });
    if (!fromShelf) {
      await this.ensureBeforeCutoff(order, content, actor, options.decidedAt);
    }
    const arranged = await this.composition.arrange(
      content,
      parties,
      loaded.context,
      // É12 (Hugo, 2026-11-03) : la règle de la passation, E1 comprise.
      windowRequesterOf(order.companyId, actor === "staff"),
      options.decidedAt,
    );
    const input = revisedInputOf(
      order,
      // R4 : la surtaxe de la passation, ni créée ni retirée — son ajustement
      // figé, que `priceBasket` applique au nouveau sous-total.
      OrderComposition.draftOf(content, loaded.context, arranged, {
        lateFee: order.lateFeeAdjustment,
      }),
    );
    const revision = options.requireChange
      ? Order.revise(order, input)
      : recomposedForQuote(order, input);
    // Les remises rejouées que la révision ferait perdre, lues sur LE calcul
    // de l'agrégat — il n'est plus refait ici (L7, 2026-11-04).
    const notes = revision.pricingNotes;
    warnBeyondCap(this.logger, notes);
    return { revision, refusals: [...loaded.keptRefusals, ...notes.refusals] };
  }

  /**
   * **Sous le verrou de la ligne `orders`** : la vitrine OU la journée,
   * jamais les deux (plan du jour J, §11.2, §13). Une commande sur stock
   * prend le verrou du stock et rejuge le reste ; une commande fabriquée
   * tient sa journée, après le guichet du fournil.
   *
   * @throws {ShelfStockShortError} sur stock : une hausse dépasse le reste.
   * @throws {RevisionIntoClosedDayError} la commande changerait pour une journée arrêtée.
   * @throws {ProductionPlanClosedError} le client modifie une commande d'une journée arrêtée.
   */
  async holdSupply(
    order: RevisableOrder,
    revision: OrderRevisionToSave,
    actor: RevisionActor,
  ): Promise<void> {
    if (order.supply === "shelf") {
      await this.shelf.hold(order, revision);
      return;
    }
    await this.holdDay(revision, actor);
  }

  /** La nouvelle journée n'a pas été arrêtée depuis la composition. */
  private async holdDay(revision: OrderRevisionToSave, actor: RevisionActor): Promise<void> {
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
    decidedAt: Instant,
  ): Promise<void> {
    // L'arrêt se juge maintenant ; le « jour même », au geste (R6).
    const closed = await this.plans.isClosed(day);
    if (day !== order.serviceDay) {
      if (closed && day !== null) {
        throw new RevisionIntoClosedDayError(day);
      }
      // La porte de la révision : celle de qui modifie (lot L4 du jour J).
      await this.plans.ensureNotTooSoon(
        day,
        sameDayDoorOf(order.companyId, actor === "staff"),
        decidedAt,
      );
      return;
    }
    if (closed && actor === "customer") {
      throw new ProductionPlanClosedError(day ?? "");
    }
  }

  /**
   * Le premier jour commandable (plan `plan-premier-jour-commandable.md`),
   * pour le client et quand la date CHANGE seulement : une commande déjà
   * passée pour une journée plus tôt n'est pas touchée, et l'équipe n'y est
   * pas soumise. La porte est celle de la passation, exemptions comprises ;
   * la clientèle est relue au statut de la société aujourd'hui.
   *
   * @throws {ServiceDayBeforeFirstOrderableDayError} la nouvelle journée précède le premier jour.
   */
  private async ensureFirstOrderableDay(
    order: RevisableOrder,
    day: string | null,
    actor: RevisionActor["kind"],
    decidedAt: Instant,
  ): Promise<void> {
    if (actor === "staff" || day === order.serviceDay) {
      return;
    }
    await this.intake.ensureServiceDayFor(
      order.companyId,
      { userId: order.placedByUserId },
      day,
      decidedAt,
    );
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
    decidedAt: Instant,
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
        await this.cutoffs.ensure(skus, day, order.companyId, {
          withWaiver: false,
          at: decidedAt,
        });
      }
    }
  }
}

/**
 * `requireChange` : R6 ; `rulesOf` : les règles de qui s'appliquent (cf.
 * {@link OrderRevising.compose}).
 *
 * `decidedAt` (plan S2, R6) : l'instant où le geste a été décidé — l'heure
 * limite, le « jour même », le premier jour commandable et les opérations
 * datées s'y jugent. M1 et son devis passent l'horloge ; une hausse appliquée
 * après paiement passera la création de son projet. Restent jugés
 * MAINTENANT : le chiffrage, l'arrêt du plan et le guichet du fournil.
 */
export interface RevisionOptions {
  readonly requireChange: boolean;
  readonly rulesOf?: RevisionActor["kind"];
  readonly decidedAt: Instant;
}

/** Une révision chiffrée, et les refus de prix que le devis montre (§ 10.4). */
export interface QuotedRevision {
  readonly revision: OrderRevisionToSave;
  readonly refusals: readonly RevisionPriceRefusal[];
}

/**
 * L'entrée de l'agrégat : la composition du jour, et tout ce que la révision
 * relit sur la commande sans le recalculer (R2, R4).
 *
 * @throws {OrderWithoutSalesTermsError} une commande d'avant les CGV figées.
 */
function revisedInputOf(order: RevisableOrder, composed: ComposedDraft): PricedDraftInput {
  const salesTerms = order.salesTerms;
  if (salesTerms === null) {
    throw new OrderWithoutSalesTermsError(order.orderId);
  }
  return {
    ...composed,
    companyId: order.companyId,
    billedCompanyId: order.billedCompanyId,
    principal: order.principal,
    placedByUserId: order.placedByUserId,
    placedByStaffId: order.placedByStaffId,
    buyerKind: order.buyerKind,
    catalogVersionId: order.catalogVersionId,
    // Le bon garde la part déjà déduite : l'agrégat la borne au nouveau total,
    // et la révision refuse qu'elle baisse (§9). Dans l'unité de la méthode :
    // la valeur faciale TTC pour `exact_ht` (relue par `toRevisableOrder`).
    voucher:
      order.voucher === null
        ? null
        : { id: order.voucher.id, valueCents: order.voucher.appliedCents },
    salesTerms,
    locale: order.locale === null ? null : OrderLocale.of(order.locale),
  };
}

/**
 * La clientèle figée de la commande, tirée de ses CGV (`salesTermsOf` à
 * rebours) ; `null` sans CGV figées — la révision les refuse plus loin
 * ({@link revisedInputOf}), et le chargement retombe alors sur aujourd'hui.
 */
function frozenAudienceOf(order: RevisableOrder): CustomerAudience | null {
  return order.salesTerms === null ? null : audienceOfSalesTerms(order.salesTerms.document);
}

/**
 * Le tarif de livraison figé à la passation, et sa zone (plan
 * `plan-livraison-offerte.md`, 1a, Hugo, 2026-11-05) ; `null` en retrait ou
 * sur une commande d'avant le barème figé. Le seuil du franco figé l'accompagne
 * (1b) : la révision rejuge le franco contre lui.
 */
function frozenDeliveryFeeOf(order: RevisableOrder): FrozenDeliveryFee | null {
  const zoneId = order.fulfillment.deliveryZoneId;
  const fee = order.deliveryFeeAdjustment;
  return zoneId === null || fee === null
    ? null
    : { zoneId, fee, freeDeliveryThresholdCents: order.freeDeliveryThresholdCents };
}

/** L'état que la règle de l'annulation lit, tiré de la commande. */
function subjectOf(order: RevisableOrder) {
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    placedByUserId: order.placedByUserId,
    companyId: order.companyId,
    fulfillmentMethod: order.fulfillment.method,
    supply: order.supply,
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

/**
 * Le devis, tant que R2 ter n'est pas livré (plan S2, lot S2.b) : il refuse
 * comme aujourd'hui tout ce qui n'est pas `same_settlement` — la commande carte
 * est déjà arrêtée plus tôt par `card_settled`, ceci n'est que le filet.
 *
 * @throws {CardOrderNotRevisableError} le règlement n'est pas celui de la commande.
 */
function recomposedForQuote(order: RevisableOrder, input: PricedDraftInput): OrderRevisionToSave {
  const { revision, settlement } = Order.recompose(order, input);
  const refusal = cardRefusalOf(settlement);
  if (refusal !== null) {
    throw new CardOrderNotRevisableError(order.orderId, refusal);
  }
  return revision;
}
