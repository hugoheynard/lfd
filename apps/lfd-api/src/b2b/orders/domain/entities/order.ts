import { ProductionPlanClosedError } from "../errors/production-plan-closed.error.js";
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
import { lineHtAmountsOf, type DraftedAmounts } from "./order-amounts.js";
import { exactAmountsOf } from "./order-exact-amounts.js";
import { clienteleOf, normalizeFulfillment } from "./order-fulfillment.js";
import {
  ensureChanged,
  ensureNoShortfallDecision,
  ensureRevisableSettlement,
  revisionOf,
  type OrderRevisionToSave,
  type RevisableOrder,
} from "./order-revision.js";
import type {
  DraftOrderInput,
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
} from "../services/customer-cancellation-window.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import type { OrderLocale } from "../value-objects/order-locale.js";
import { placementVatMethodOf, type OrderVatMethod } from "../value-objects/order-vat-method.js";

export type {
  DraftOrderInput,
  OrderFulfillmentInput,
  OrderPrincipal,
  OrderSalesTerms,
  OrderToPlace,
  OrderVoucher,
} from "./order-shapes.js";

/**
 * Une composition par méthode de TVA (plan du centime, § 4) : on ajoute une
 * méthode en ajoutant une entrée, pas une branche dans `compose`.
 */
const AMOUNTS_BY_METHOD: Readonly<
  Record<
    OrderVatMethod,
    (input: DraftOrderInput, fulfillment: OrderFulfillmentInput) => DraftedAmounts
  >
> = {
  line_ht: lineHtAmountsOf,
  exact_ht: exactAmountsOf,
};

/** Décision de règlement : indécise (`null`), carte (intent), ou différée. */
type Payment = { readonly status: PaymentStatus; readonly intentId: string | null } | null;

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
    private readonly fulfillment: OrderFulfillmentInput,
    private readonly agreed: AgreedFulfillment,
    private readonly requestedDeliveryDate: Date | null,
    private readonly note: string,
    private readonly catalogVersionId: string | null,
    private readonly amounts: DraftedAmounts,
    private readonly discountAdjustment: CartAdjustment | null,
    private readonly deliveryFeeAdjustment: CartAdjustment | null,
    private readonly lateFeeCents: number,
    private readonly lateFeeAdjustment: LateFeeAdjustment | null,
    private readonly deliveryVatMode: DeliveryVatMode,
    private readonly voucher: { readonly id: string; readonly appliedCents: number } | null,
    private readonly salesTerms: OrderSalesTerms,
    private readonly locale: OrderLocale | null,
  ) {}

  /**
   * Compose une commande qu'on PASSE : valide, fige les lignes et calcule tous
   * les montants. La méthode de TVA se décide ici, une fois, sur l'absence de
   * société (`placementVatMethodOf`) ; ensuite elle se relit (`recompose`).
   */
  static draft(input: DraftOrderInput): Order {
    return Order.compose(input, placementVatMethodOf(input.companyId));
  }

  /**
   * La composition, pour une méthode DONNÉE — décidée par `draft`, relue sur
   * la commande par `recompose`. Les montants de `input` sont dans l'unité de
   * la méthode (HT pour `line_ht`, TTC pour `exact_ht`).
   */
  private static compose(input: DraftOrderInput, vatMethod: OrderVatMethod): Order {
    ensureDraftable(input);
    const fulfillment = normalizeFulfillment(input.fulfillment, input.companyId);
    const amounts = AMOUNTS_BY_METHOD[vatMethod](input, fulfillment);
    return new Order(
      input.companyId,
      input.billedCompanyId,
      input.principal,
      input.placedByUserId,
      input.placedByStaffId,
      fulfillment,
      input.agreed,
      input.requestedDeliveryDate,
      input.note,
      input.catalogVersionId,
      amounts,
      input.discountAdjustment,
      input.deliveryFeeAdjustment,
      input.lateFeeCents,
      input.lateFeeAdjustment,
      input.deliveryVatMode,
      input.voucher === null
        ? null
        : { id: input.voucher.id, appliedCents: amounts.voucherDiscountCents },
      input.salesTerms,
      input.locale,
    );
  }

  /**
   * **Une révision de la commande** (plan `plan-modifier-une-commande.md`, M1) :
   * la nouvelle composition se calcule EXACTEMENT comme à la passation
   * (`draft`), garde le règlement de la commande (au compte ou gratuit — M1
   * refuse la carte), puis se juge contre la révision qu'elle corrige : prix
   * figés tenus (R3), bon imputé couvert (R4), au moins un changement (R6).
   *
   * @throws {CardOrderNotRevisableError} la commande se règle par carte (lot M2).
   * @throws {ShortfallDecidedRevisionError} son départ incomplet est décidé (E6b).
   * @throws {UnchangedOrderRevisionError} la modification ne change rien.
   */
  static revise(current: RevisableOrder, input: DraftOrderInput): OrderRevisionToSave {
    const revision = Order.recompose(current, input);
    ensureChanged(revision);
    return revision;
  }

  /** La même recomposition, sans exiger de changement : ce que le devis de révision montre. */
  static recompose(current: RevisableOrder, input: DraftOrderInput): OrderRevisionToSave {
    ensureRevisableSettlement(current);
    ensureNoShortfallDecision(current);
    const revised = Order.compose(input, current.vatMethod);
    revised.carryCustomerCancellation(
      effectiveFixedCancellation(current.customerCancellation, current.customerCancellableUntil, {
        serviceDay: current.serviceDay,
        windowStart: current.agreed.window.value?.start ?? null,
      }),
    );
    revised.deferPayment();
    return revisionOf(current, revised.toPersistence());
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
    return this.amounts.totalCents;
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
    return this.amounts.ttcTerms?.voucherCents ?? this.voucher.appliedCents;
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
      subtotalCents: this.amounts.subtotalCents,
      discountCents: this.amounts.discountCents,
      voucherDiscountCents: this.voucherDiscountCents,
    };
  }

  /** Règlement **carte** : rattache l'intention Stripe. Refuse un total nul. */
  payByCard(paymentIntentId: string): void {
    if (this.amounts.totalCents <= 0) {
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
    return settlementRegimeOf(this.payment.status, this.amounts.totalCents);
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
      placedOffPlan: this.offPlan,
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
      vatMethod: this.amounts.vatMethod,
      subtotalCents: this.amounts.subtotalCents,
      discountCents: this.amounts.discountCents,
      discountTtcCents: this.amounts.ttcTerms?.discountCents ?? null,
      discountAdjustment: this.discountAdjustment,
      deliveryFeeCents: this.amounts.deliveryFeeCents,
      deliveryFeeTtcCents: this.amounts.ttcTerms?.deliveryFeeCents ?? null,
      deliveryFeeAdjustment: this.deliveryFeeAdjustment,
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
      deliveryVatMode: this.deliveryVatMode,
      voucherDiscountCents: this.voucherDiscountCents,
      voucherTtcCents: this.amounts.ttcTerms?.voucherCents ?? null,
      loyaltyVoucherId: this.voucher?.id ?? null,
      vatCents: this.amounts.vatCents,
      vatShares: this.amounts.vatShares,
      ttcByRate: this.amounts.ttcByRate,
      totalCents: this.amounts.totalCents,
      paymentStatus: this.payment.status,
      stripePaymentIntentId: this.payment.intentId,
      salesTerms: this.salesTerms,
      locale: this.locale?.code ?? null,
      lines: this.amounts.lines.map((line) => line.toSnapshot()),
    };
  }
}
