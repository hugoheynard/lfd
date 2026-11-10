import {
  ensureFulfillmentKeepsPromotion,
  revisedFulfillmentOf,
} from "../services/fulfillment-promotion.js";
import { ensureSlotKeepsPromotionHours } from "../services/slot-promotion-hours.js";
import { ensureShelfKeepsRoute, ensureSupplyFits } from "../services/order-supply-rules.js";
import { ProductionPlanClosedError } from "../errors/production-plan-closed.error.js";
import { EntryOriginWithoutStaffError } from "../errors/entry-origin-errors.js";
import type {
  // Aliasé : `OrderFulfillmentInput` désigne déjà ici le mode + les adresses.
  // Deux « fulfillment » dans le même fichier finiraient par se confondre.
  OrderFulfillment as AgreedFulfillment,
  CartAdjustment,
  DeliveryVatMode,
  LateFeeAdjustment,
  PaymentStatus,
  SettlementRegime,
} from "@lfd/contracts";

import { InvalidOrderPaymentError } from "../errors/order-errors.js";

import { ensureDraftable } from "./order-amount-guards.js";
import { draftedAmountsOf, type DraftedAmounts } from "./order-amounts.js";
import {
  appliedBasketDiscountsOf,
  basketTracesOf,
  type BasketDiscountTrace,
} from "./order-basket-discounts.js";
import {
  draftInputOf,
  type OrderPricingNotes,
  type PricedDraftInput,
} from "./order-priced-draft.js";
import { orderAmountsReadingOf, type OrderAmountsReading } from "./order-amounts-reading.js";
import { shelfClaimOf, type ShelfClaim } from "../services/shelf-circuit.js";
import { clienteleOf, normalizeFulfillment } from "./order-fulfillment.js";
import {
  ensureNoShortfallDecision,
  revisionOf,
  type RevisableOrder,
  type RevisionActor,
} from "../../revision/domain/entities/order-revision.js";
import {
  ensureSettlementExpected,
  type ExpectedSettlement,
  revisionSettlementOf,
  type RecomposedRevision,
} from "../../revision/domain/entities/revision-settlement.js";
import type {
  DraftOrderInput,
  OrderDiscountLabel,
  OrderFulfillmentInput,
  OrderPrincipal,
  OrderSalesTerms,
  OrderToPlace,
} from "./order-shapes.js";
import {
  effectiveFixedCancellation,
  fixedCancellationDeadlineOf,
  fixedCancellationOf,
  NOT_FIXED_CANCELLATION,
  type CancellationAnchorSource,
  type CustomerCancellationPolicy,
  type FixedCustomerCancellation,
} from "../../cancellation/domain/services/customer-cancellation-window.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import type { FreeDelivery } from "../value-objects/free-delivery.js";
import type { OrderBuyerKind } from "../value-objects/order-buyer-kind.js";
import type { OrderLocale } from "../value-objects/order-locale.js";
import { placementVatMethodOf, type OrderVatMethod } from "../value-objects/order-vat-method.js";
import {
  PLANNED_SUPPLY,
  supplyMarkOf,
  type OrderEntryOrigin,
  type OrderSupplyDecision,
  type OrderSupplyMark,
} from "../value-objects/order-supply.js";

export type {
  DraftOrderInput,
  OrderFulfillmentInput,
  OrderPrincipal,
  OrderSalesTerms,
  OrderToPlace,
  OrderVoucher,
} from "./order-shapes.js";

/** Décision de règlement : indécise (`null`), carte (intent), ou différée. */
type Payment = { readonly status: PaymentStatus; readonly intentId: string | null } | null;

/** Plan S1, R5 bis : ce que M1 admet — comme la commande, ou la baisse carte rendue. */
const M1_SETTLEMENTS: ReadonlySet<ExpectedSettlement> = new Set<ExpectedSettlement>([
  "same_settlement",
  "card_refund",
]);
/** Plan S2, §2.4 : la hausse payée n'admet que son complément. */
const COMPLEMENT_ONLY: ReadonlySet<ExpectedSettlement> = new Set<ExpectedSettlement>([
  "card_complement",
]);

/**
 * **Commande** (agrégat racine). Elle possède son **argent** : sous-total, TVA
 * (via le moteur `vat`) et total TTC sont calculés ici, pas dans le handler. La
 * passation est un cycle : `draft()` fige lignes + acheminement et calcule les
 * montants ; puis on décide le règlement — `payByCard(intent)` (total > 0) ou
 * `deferPayment()`. `toPersistence()` refuse une commande dont le règlement n'est
 * pas décidé (pas de commande fantôme).
 */
export class Order {
  private payment: Payment = null;
  private offPlan = false;
  private customerCancellation: FixedCustomerCancellation = NOT_FIXED_CANCELLATION;
  private customerCancellableUntil: Date | null = null;
  private constructor(
    private readonly companyId: string | null,
    private readonly billedCompanyIdValue: string | null,
    private readonly principal: OrderPrincipal | null,
    private readonly placedByUserId: string,
    private readonly placedByStaffId: string | null,
    private readonly buyerKind: OrderBuyerKind,
    private readonly fulfillment: OrderFulfillmentInput,
    private readonly agreed: AgreedFulfillment,
    private readonly requestedDeliveryDate: Date | null,
    private readonly note: string,
    private readonly catalogVersionId: string | null,
    private readonly drafted: DraftedAmounts,
    private readonly discountAdjustment: CartAdjustment | null,
    private readonly discountLabel: OrderDiscountLabel | null,
    private readonly discountPromotionId: string | null,
    private readonly basketTraces: readonly BasketDiscountTrace[],
    private readonly deliveryFeeAdjustment: CartAdjustment | null,
    private readonly freeDelivery: FreeDelivery | null,
    private readonly lateFeeCents: number,
    private readonly lateFeeAdjustment: LateFeeAdjustment | null,
    private readonly deliveryVatMode: DeliveryVatMode,
    private readonly voucher: { readonly id: string; readonly appliedCents: number } | null,
    private readonly salesTerms: OrderSalesTerms,
    private readonly locale: OrderLocale | null,
    private readonly supplyMark: OrderSupplyMark,
    private readonly pricingNotesValue: OrderPricingNotes,
  ) {}

  /**
   * Compose une commande qu'on PASSE : valide, fige les lignes et calcule tous
   * les montants. La méthode de TVA se décide ici, une fois, sur l'absence de
   * société (`placementVatMethodOf`) ; ensuite elle se relit (`recompose`).
   *
   * `supply` dit d'où vient la marchandise (plan du jour J, §11.1) ; décidée
   * par l'appelant, jamais par le client, et figée ici. Sans elle : `planned`,
   * le comportement d'avant la marque. `entryOrigin` dit d'où vient la saisie
   * de l'équipe (Hugo, 2026-11-04) ; `null` pour le client lui-même.
   *
   * @throws {EntryOriginWithoutStaffError} une origine de saisie sans équipe.
   * @throws {ShelfOrderNotPickupError} une commande sur stock qui n'est pas un retrait.
   * @throws {ShelfOrderNotTodayError} une commande sur stock qui ne vise pas aujourd'hui.
   */
  static draft(
    request: PricedDraftInput,
    supply: OrderSupplyDecision = PLANNED_SUPPLY,
    entryOrigin: OrderEntryOrigin | null = null,
  ): Order {
    if (entryOrigin !== null && request.placedByStaffId === null) {
      throw new EntryOriginWithoutStaffError();
    }
    const vatMethod = placementVatMethodOf(request.companyId);
    // Le prix du panier d'abord, comme la composition le faisait avant
    // l'agrégat : l'ordre des refus ne bouge pas (lot L1a).
    const { input, notes } = draftInputOf(request, vatMethod);
    ensureSupplyFits(supply, input.fulfillment, input.requestedDeliveryDate);
    return Order.compose(input, vatMethod, supplyMarkOf(supply, entryOrigin), notes);
  }

  /**
   * Ce que le chiffrage de cette composition a dit en plus des montants
   * (promotions écartées au-delà de cinq). Jamais persisté : il ne vaut que
   * pour l'appelant qui vient de composer.
   */
  pricingNotes(): OrderPricingNotes {
    return this.pricingNotesValue;
  }

  /**
   * La composition, pour une méthode DONNÉE — décidée par `draft`, relue sur
   * la commande par `recompose`. Les montants de `input` sont dans l'unité de
   * la méthode (HT pour `line_ht`, TTC pour `exact_ht`).
   */
  private static compose(
    input: DraftOrderInput,
    vatMethod: OrderVatMethod,
    supply: OrderSupplyMark,
    notes: OrderPricingNotes,
  ): Order {
    ensureDraftable(input);
    const fulfillment = normalizeFulfillment(input.fulfillment, input.companyId);
    const amounts = draftedAmountsOf(input, fulfillment, vatMethod);
    return new Order(
      input.companyId,
      input.billedCompanyId,
      input.principal,
      input.placedByUserId,
      input.placedByStaffId,
      input.buyerKind,
      fulfillment,
      input.agreed,
      input.requestedDeliveryDate,
      input.note,
      input.catalogVersionId,
      amounts,
      input.discountAdjustment,
      input.discountLabel ?? null,
      input.discountPromotionId ?? null,
      basketTracesOf(input),
      input.deliveryFeeAdjustment,
      input.freeDelivery,
      input.lateFeeCents,
      input.lateFeeAdjustment,
      input.deliveryVatMode,
      input.voucher === null
        ? null
        : { id: input.voucher.id, appliedCents: amounts.voucherDiscountCents },
      input.salesTerms,
      input.locale,
      supply,
      notes,
    );
  }

  /**
   * **Une révision de la commande** (voir `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») :
   * la nouvelle composition se calcule EXACTEMENT comme à la passation
   * (`draft`), garde le règlement de la commande (au compte, gratuit, ou une
   * carte encaissée qui baisse ou reste égale — plan S1), puis se juge contre la révision qu'elle corrige : prix
   * figés tenus (R3), bon imputé couvert (R4), au moins un changement (R6).
   *
   * @throws {CardOrderNotRevisableError} carte, ni comme la commande ni rendue, avec la raison du tri (R2 bis).
   * @throws {ShortfallDecidedRevisionError} son départ incomplet est décidé (E6b).
   * @throws {UnchangedOrderRevisionError} la modification ne change rien.
   * @throws {FulfillmentChangeAltersPromotionError} le nouvel acheminement sort de la cible figée d'une remise (L9).
   * @throws {ShelfOrderRouteChangeError} une commande sur stock changerait de mode, de journée ou de point.
   */
  static revise(
    current: RevisableOrder,
    input: PricedDraftInput,
    by: RevisionActor["kind"] = "customer",
  ): RecomposedRevision {
    // M1 (plan S1, R5 bis) : comme la commande, ou une baisse carte rendue —
    // le règlement remonte jusqu'au handler, seule source du montant à rendre.
    // Une hausse carte passe par un projet de complément. `by` ne change que
    // la raison d'un refus (plan S2, R15 : l'équipe n'augmente pas une carte).
    return ensureSettlementExpected(current, Order.recompose(current, input), M1_SETTLEMENTS, by);
  }

  /**
   * **Une hausse payée par un complément** (plan S2, §2.4) : la même
   * recomposition, qui n'admet QUE `card_complement` — rendu avec son
   * complément. Le client seul (R15).
   *
   * @throws {CardOrderNotRevisableError} carte pas encore encaissée, déjà rendue, ou l'équipe.
   * @throws {CardIncreaseNotApplicableError} pas de complément à payer (pas de carte, baisse, total égal).
   */
  static reviseWithComplement(
    current: RevisableOrder,
    input: PricedDraftInput,
    by: RevisionActor["kind"],
  ): RecomposedRevision {
    return ensureSettlementExpected(current, Order.recompose(current, input), COMPLEMENT_ONLY, by);
  }

  /**
   * La même recomposition, sans exiger de changement ni lever sur le
   * règlement : elle rend la révision ET son règlement (plan S2, R2 bis) — le
   * tri se fait sur le nouveau total, après la composition, jamais avant.
   */
  static recompose(current: RevisableOrder, request: PricedDraftInput): RecomposedRevision {
    // Chiffrée dans la méthode RELUE sur la commande (plan du centime, § 5).
    const { input, notes } = draftInputOf(request, current.vatMethod);
    ensureNoShortfallDecision(current);
    // L9 avant les gardes de montant : une remise emportée hors de sa cible
    // se refuse en nommant la promotion (plan des remises acquises, § 10.2).
    const revisedFulfillment = revisedFulfillmentOf(input);
    // Une commande sur stock garde son acheminement (plan du jour J, §13).
    ensureShelfKeepsRoute(current, revisedFulfillment);
    ensureFulfillmentKeepsPromotion(current, revisedFulfillment);
    // Le créneau, contre les heures figées d'une promotion « au retrait ».
    ensureSlotKeepsPromotionHours(current, revisedFulfillment);
    // La marque se relit sur la commande : elle n'a aucun setter.
    const revised = Order.compose(
      input,
      current.vatMethod,
      {
        supply: current.supply,
        entryShortcut: current.entryShortcut,
        entryOrigin: current.entryOrigin,
      },
      notes,
    );
    revised.carryCustomerCancellation(
      effectiveFixedCancellation(current.customerCancellation, current.customerCancellableUntil, {
        serviceDay: current.serviceDay,
        windowStart: current.agreed.window.value?.start ?? null,
      }),
    );
    // Le règlement de la commande n'est jamais réécrit par la révision
    // (`revisions.save` n'écrit aucune colonne de paiement) : `deferPayment`
    // ne sert qu'à composer, et `revisionOf` ne lit plus `onAccount` sur lui
    // pour une carte (R2).
    revised.deferPayment();
    const revision = { ...revisionOf(current, revised.toPersistence()), pricingNotes: notes };
    return { revision, settlement: revisionSettlementOf(current, revision.totalAfterCents) };
  }

  /**
   * Le payeur copié à la passation — celui dont les termes décident du
   * règlement au compte (T44), et que tout lecteur de l'argent lit ensuite.
   */
  get billedCompanyId(): string | null {
    return this.billedCompanyIdValue;
  }

  /** Total **TTC** à encaisser — la source pour dimensionner l'intention Stripe. */
  get totalCents(): number {
    return this.drafted.totalCents;
  }

  /** La part du bon réellement imputée, HT — `0` sans bon. La colonne `voucher_discount_cents`. */
  get voucherDiscountCents(): number {
    return this.voucher?.appliedCents ?? 0;
  }

  /**
   * **Ce que le bon a servi, en valeur faciale** — l'unité du registre de
   * fidélité (`appliedCents`, plan du centime § 5 R6, § 10 Q2) : TTC pour une
   * commande `exact_ht`, HT pour `line_ht`. Ce que le reliquat retranche.
   */
  get voucherFaceCents(): number {
    if (this.voucher === null) {
      return 0;
    }
    return this.drafted.ttcTerms?.voucherCents ?? this.voucher.appliedCents;
  }

  /**
   * L'assiette des points telle que la fidélité la crédite — sous-total,
   * remise et part du bon, tous trois hors taxe et tels qu'ils seront écrits.
   * Lue par la passation sans compte pour dire ce qu'un compte aurait rapporté.
   */
  get earningAmounts(): {
    readonly subtotalCents: number;
    readonly discountCents: number;
    readonly voucherDiscountCents: number;
  } {
    return {
      subtotalCents: this.drafted.subtotalCents,
      discountCents: this.drafted.discountCents,
      voucherDiscountCents: this.voucherDiscountCents,
    };
  }

  /**
   * **Les montants de la commande composée, sans rien décider** (plan
   * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : ce que
   * l'estimation de la saisie rend. Les valeurs mêmes de `toPersistence()`,
   * sans exiger de règlement décidé — un devis n'en décide aucun.
   */
  amounts(): OrderAmountsReading {
    return orderAmountsReadingOf({
      drafted: this.drafted,
      basketTraces: this.basketTraces,
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
      voucherDiscountCents: this.voucherDiscountCents,
    });
  }

  /**
   * Ce qu'elle prend à la vitrine de son point, ou `null` si elle est
   * fabriquée — lu sans règlement décidé, pour que l'estimation juge le reste
   * par la même prise que la passation sous verrou (lot P2).
   */
  get shelfClaim(): ShelfClaim | null {
    return shelfClaimOf({
      supply: this.supplyMark.supply,
      requestedDeliveryDate: this.requestedDeliveryDate,
      pickupAddress: this.fulfillment.pickupAddress,
      lines: this.drafted.lines,
    });
  }

  /** Règlement **carte** : rattache l'intention Stripe. Refuse un total nul. */
  payByCard(paymentIntentId: string): void {
    if (this.drafted.totalCents <= 0) {
      throw new InvalidOrderPaymentError("Une carte ne peut régler un total nul.");
    }
    this.payment = { status: "pending", intentId: paymentIntentId };
  }

  /** Règlement **différé** (terme d'entreprise) ou gratuit : rien à encaisser. */
  deferPayment(): void {
    this.payment = { status: "not_required", intentId: null };
  }

  /**
   * Le régime de règlement décidé — la même dérivation que le lecteur
   * (`settlementRegimeOf`) : la réponse de passation et la vue relue disent le
   * même régime (F5). Refuse, comme `toPersistence`, un règlement non décidé.
   */
  get settlementRegime(): SettlementRegime {
    if (this.payment === null) {
      throw new InvalidOrderPaymentError("Le règlement de la commande n'est pas décidé.");
    }
    return settlementRegimeOf(this.payment.status, this.drafted.totalCents);
  }

  /** Prise sur la vitrine (`shelf`) — lu avant que le règlement soit décidé (Q7, lot L4). */
  get isFromShelf(): boolean {
    return this.supplyMark.supply === "shelf";
  }

  /**
   * **Reçue pour une journée dont le plan est déjà arrêté** (lot O3,
   * `plan-reglages-commandes.md` §8.3, Hugo 2026-10-14). Seule l'équipe le
   * peut : un client est refusé, il n'existe pas de chemin pour lui.
   *
   * @throws {ProductionPlanClosedError} la commande n'est pas une saisie de l'équipe.
   */
  receiveOffPlan(fulfillmentDate: string): void {
    if (this.placedByStaffId === null) {
      throw new ProductionPlanClosedError(fulfillmentDate);
    }
    this.offPlan = true;
  }

  /**
   * **Le délai d'annulation du particulier, figé à sa passation** (Hugo,
   * 2026-10-26) : les CGV promettent le délai rappelé avant la validation,
   * donc le réglage d'aujourd'hui, pas celui du jour où il annulera. Le délai
   * LUI-MÊME est figé — y compris « sans délai » —, et l'instant limite en
   * découle par la règle même du refus P2 (`customerCancellationDeadlineOf`).
   *
   * Une commande de société reste non figée : un pro annule jusqu'à l'arrêt
   * du plan, et n'a pas de délai réglable.
   */
  fixCustomerCancellationDeadline(policy: CustomerCancellationPolicy): void {
    this.carryCustomerCancellation(
      this.companyId === null ? fixedCancellationOf(policy) : NOT_FIXED_CANCELLATION,
    );
  }

  /**
   * Le délai figé, reporté sur une recomposition : une révision du jour ou du
   * créneau recalcule l'instant avec le délai d'ORIGINE, jamais avec le
   * réglage du jour (Hugo, 2026-10-26).
   */
  private carryCustomerCancellation(fixed: FixedCustomerCancellation): void {
    this.customerCancellation = fixed;
    this.customerCancellableUntil = fixedCancellationDeadlineOf(fixed, this.anchorSource());
  }

  private anchorSource(): CancellationAnchorSource {
    return {
      // `@db.Date` composé à minuit UTC : le jour se relit tel quel.
      serviceDay: this.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      windowStart: this.agreed.window.value?.start ?? null,
    };
  }

  /** Sérialise pour l'adaptateur — refuse une commande au règlement non décidé. */
  toPersistence(): OrderToPlace {
    if (this.payment === null) {
      throw new InvalidOrderPaymentError("Le règlement de la commande n'est pas décidé.");
    }
    return {
      companyId: this.companyId,
      billedCompanyId: this.billedCompanyIdValue,
      principalCompanyId: this.principal?.companyId ?? null,
      principalSeesAmount: this.principal?.seesAmount ?? null,
      clientele: clienteleOf(this.companyId),
      placedByUserId: this.placedByUserId,
      placedByStaffId: this.placedByStaffId,
      buyerKind: this.buyerKind,
      placedOffPlan: this.offPlan,
      supply: this.supplyMark.supply,
      entryShortcut: this.supplyMark.entryShortcut,
      entryOrigin: this.supplyMark.entryOrigin,
      customerCancellation: this.customerCancellation,
      customerCancellableUntil: this.customerCancellableUntil,
      fulfillmentMethod: this.fulfillment.method,
      deliveryZoneId: this.fulfillment.deliveryZoneId,
      deliveryAddress: this.fulfillment.deliveryAddress,
      deliveryAddressId: this.fulfillment.deliveryAddressId,
      pickupAddress: this.fulfillment.pickupAddress,
      agreed: this.agreed,
      requestedDeliveryDate: this.requestedDeliveryDate,
      note: this.note,
      catalogVersionId: this.catalogVersionId,
      vatMethod: this.drafted.vatMethod,
      subtotalCents: this.drafted.subtotalCents,
      discountCents: this.drafted.discountCents,
      discountTtcCents: this.drafted.ttcTerms?.discountCents ?? null,
      discountAdjustment: this.discountAdjustment,
      discountLabel: this.discountLabel,
      discountPromotionId: this.discountPromotionId,
      basketDiscounts: appliedBasketDiscountsOf(this.drafted.basketSteps, this.basketTraces),
      deliveryFeeCents: this.drafted.deliveryFeeCents,
      deliveryFeeTtcCents: this.drafted.ttcTerms?.deliveryFeeCents ?? null,
      deliveryFeeAdjustment: this.deliveryFeeAdjustment,
      freeDelivery: this.freeDelivery,
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
      deliveryVatMode: this.deliveryVatMode,
      voucherDiscountCents: this.voucherDiscountCents,
      voucherTtcCents: this.drafted.ttcTerms?.voucherCents ?? null,
      loyaltyVoucherId: this.voucher?.id ?? null,
      vatCents: this.drafted.vatCents,
      vatShares: this.drafted.vatShares,
      ttcByRate: this.drafted.ttcByRate,
      totalCents: this.drafted.totalCents,
      paymentStatus: this.payment.status,
      stripePaymentIntentId: this.payment.intentId,
      salesTerms: this.salesTerms,
      locale: this.locale?.code ?? null,
      lines: this.drafted.lines.map((line) => line.toSnapshot()),
    };
  }
}
