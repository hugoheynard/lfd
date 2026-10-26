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
import type { VatShare } from "@lfd/money";

import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureDraftable,
  ensureLateFeeMatches,
  ensurePickupDiscountOnlyOnPickup,
  voucherDiscountOf,
} from "./order-amount-guards.js";
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
  customerCancellationDeadlineOf,
  type CustomerCancellationPolicy,
} from "../services/customer-cancellation-window.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import { computeOrderTotals } from "../services/vat.js";
import { OrderLine } from "../value-objects/order-line.js";
import type { OrderLocale } from "../value-objects/order-locale.js";

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
    private readonly lines: readonly OrderLine[],
    private readonly discountCents: number,
    private readonly discountAdjustment: CartAdjustment | null,
    private readonly deliveryFeeCents: number,
    private readonly deliveryFeeAdjustment: CartAdjustment | null,
    private readonly lateFeeCents: number,
    private readonly lateFeeAdjustment: LateFeeAdjustment | null,
    private readonly deliveryVatMode: DeliveryVatMode,
    private readonly voucher: { readonly id: string; readonly appliedCents: number } | null,
    private readonly subtotalCentsValue: number,
    private readonly vatCentsValue: number,
    private readonly vatSharesValue: readonly VatShare[],
    private readonly totalCentsValue: number,
    private readonly salesTerms: OrderSalesTerms,
    private readonly locale: OrderLocale | null,
  ) {}

  /** Compose une commande : valide, fige les lignes et calcule tous les montants. */
  static draft(input: DraftOrderInput): Order {
    ensureDraftable(input);
    const fulfillment = normalizeFulfillment(input.fulfillment, input.companyId);
    // 🔴 **L'audience est décidée UNE fois, ici** — le seul endroit qui la
    // connaisse au moment où elle est encore vraie. Chaque ligne scelle alors
    // son taxe compris, ou ne le scelle pas ; le document, plus tard, n'a plus
    // qu'à regarder ce qu'il a (R3, 2026-09-21).
    const clientele = clienteleOf(input.companyId);
    const lines = input.lines.map((line) => OrderLine.create(line, clientele));
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    // L'assiette de la remise de retrait, relue sur le drapeau des lignes —
    // jamais reçue de l'appelant (V1 du plan des exclusions).
    const eligibleSubtotalCents = lines.reduce(
      (sum, line) => (line.pickupDiscountEligible ? sum + line.lineTotalCents : sum),
      0,
    );
    ensureDiscountMatches(input, eligibleSubtotalCents);
    ensureLateFeeMatches(input, subtotalCents);
    ensureDeliveryFeeMatches(input, subtotalCents);
    ensurePickupDiscountOnlyOnPickup(input, fulfillment);
    const voucherDiscountCents = voucherDiscountOf(
      input.voucher,
      input.companyId,
      subtotalCents - input.discountCents,
    );
    // 🔴 **Une seule définition du TTC**, et elle est dans la ventilation.
    //
    // Le total se recomposait ici — `max(0, sous-total − remise) + frais +
    // surtaxe + TVA` — pendant que la TVA venait de `ventilateVat`. Les deux
    // tombaient juste, et c'est ce qui rendait la chose dangereuse : un terme
    // ajouté au panier n'entre dans la TVA et dans le total qu'en deux gestes,
    // dont un seul est évident.
    //
    // La règle que ce commentaire portait — la surtaxe s'ajoute APRÈS la remise,
    // comme les frais de zone, parce qu'on ne fait pas de geste commercial sur
    // une pénalité de retard — n'est pas perdue : elle est APPLIQUÉE dans
    // `ventilateVat`, où les extras sont proratisés sur le sous-total brut
    // quand les lignes le sont sur le net. Elle est passée de commentaire à
    // code exécuté.
    const { vatCents, vatShares, totalCents } = computeOrderTotals({
      lines: lines.map((line) => ({
        htCents: line.lineTotalCents,
        vatRate: line.vatRate,
        discountEligible: line.pickupDiscountEligible,
      })),
      discountCents: input.discountCents,
      voucherDiscountCents,
      deliveryFeeCents: input.deliveryFeeCents,
      deliveryVatMode: input.deliveryVatMode,
      lateFeeCents: input.lateFeeCents,
      lateFeeVatRate: input.lateFeeAdjustment?.vatRatePercent ?? null,
    });
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
      lines,
      input.discountCents,
      input.discountAdjustment,
      input.deliveryFeeCents,
      input.deliveryFeeAdjustment,
      input.lateFeeCents,
      input.lateFeeAdjustment,
      input.deliveryVatMode,
      input.voucher === null ? null : { id: input.voucher.id, appliedCents: voucherDiscountCents },
      subtotalCents,
      vatCents,
      vatShares,
      totalCents,
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
    const revised = Order.draft(input);
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
    return this.totalCentsValue;
  }

  /** La part du bon réellement imputée, HT — `0` sans bon. Ce que le reliquat retranche. */
  get voucherDiscountCents(): number {
    return this.voucher?.appliedCents ?? 0;
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
      subtotalCents: this.subtotalCentsValue,
      discountCents: this.discountCents,
      voucherDiscountCents: this.voucherDiscountCents,
    };
  }

  /** Règlement **carte** : rattache l'intention Stripe. Refuse un total nul. */
  payByCard(paymentIntentId: string): void {
    if (this.totalCentsValue <= 0) {
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
    return settlementRegimeOf(this.payment.status, this.totalCentsValue);
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
   * donc le réglage d'aujourd'hui, pas celui du jour où il annulera. Calculé
   * par la règle même du refus P2 (`customerCancellationDeadlineOf`).
   *
   * Reste `null` pour une commande de société — un pro annule jusqu'à l'arrêt
   * du plan, qui n'est pas un délai à figer — et quand le réglage n'impose pas
   * de délai : sans délai, seul l'arrêt du plan limite, et ce n'est pas non
   * plus un instant connu à la passation.
   */
  fixCustomerCancellationDeadline(policy: CustomerCancellationPolicy): void {
    if (this.companyId !== null || !policy.delayEnabled) {
      this.customerCancellableUntil = null;
      return;
    }
    this.customerCancellableUntil = customerCancellationDeadlineOf(policy.hoursBefore, {
      // `@db.Date` composé à minuit UTC : le jour se relit tel quel.
      serviceDay: this.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      windowStart: this.agreed.window.value?.start ?? null,
    });
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
      subtotalCents: this.subtotalCentsValue,
      discountCents: this.discountCents,
      discountAdjustment: this.discountAdjustment,
      deliveryFeeCents: this.deliveryFeeCents,
      deliveryFeeAdjustment: this.deliveryFeeAdjustment,
      lateFeeCents: this.lateFeeCents,
      lateFeeAdjustment: this.lateFeeAdjustment,
      deliveryVatMode: this.deliveryVatMode,
      voucherDiscountCents: this.voucherDiscountCents,
      loyaltyVoucherId: this.voucher?.id ?? null,
      vatCents: this.vatCentsValue,
      vatShares: this.vatSharesValue,
      totalCents: this.totalCentsValue,
      paymentStatus: this.payment.status,
      stripePaymentIntentId: this.payment.intentId,
      salesTerms: this.salesTerms,
      locale: this.locale?.code ?? null,
      lines: this.lines.map((line) => line.toSnapshot()),
    };
  }
}
