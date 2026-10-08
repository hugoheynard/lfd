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

import { EmptyOrderError, InvalidOrderPaymentError } from "../errors/order-errors.js";
import { BilledWithoutCompanyError } from "../errors/order-payer-errors.js";
import type { VatShare } from "@lfd/money";

import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureLateFeeMatches,
  voucherDiscountOf,
} from "./order-amount-guards.js";
import { clienteleOf, normalizeFulfillment } from "./order-fulfillment.js";
import type { DraftOrderInput, OrderFulfillmentInput, OrderToPlace } from "./order-shapes.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import { computeOrderTotals } from "../services/vat.js";
import { OrderLine } from "../value-objects/order-line.js";

export type {
  DraftOrderInput,
  OrderFulfillmentInput,
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

  private constructor(
    private readonly companyId: string | null,
    private readonly billedCompanyIdValue: string | null,
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
  ) {}

  /** Compose une commande : valide, fige les lignes et calcule tous les montants. */
  static draft(input: DraftOrderInput): Order {
    if (input.lines.length === 0) {
      throw new EmptyOrderError();
    }
    // L'image du CHECK `order_billed_needs_company` : refusé ici, avant la base.
    if (input.companyId === null && input.billedCompanyId !== null) {
      throw new BilledWithoutCompanyError();
    }
    if (input.discountCents < 0 || input.deliveryFeeCents < 0 || input.lateFeeCents < 0) {
      throw new InvalidOrderPaymentError("Remise, frais et surtaxe doivent être positifs.");
    }
    const fulfillment = normalizeFulfillment(input.fulfillment, input.companyId);
    // 🔴 **L'audience est décidée UNE fois, ici** — le seul endroit qui la
    // connaisse au moment où elle est encore vraie. Chaque ligne scelle alors
    // son taxe compris, ou ne le scelle pas ; le document, plus tard, n'a plus
    // qu'à regarder ce qu'il a (R3, 2026-09-21).
    const clientele = clienteleOf(input.companyId);
    const lines = input.lines.map((line) => OrderLine.create(line, clientele));
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    ensureDiscountMatches(input, subtotalCents);
    ensureLateFeeMatches(input, subtotalCents);
    ensureDeliveryFeeMatches(input, subtotalCents);
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
      lines: lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
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
    );
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

  /** Sérialise pour l'adaptateur — refuse une commande au règlement non décidé. */
  toPersistence(): OrderToPlace {
    if (this.payment === null) {
      throw new InvalidOrderPaymentError("Le règlement de la commande n'est pas décidé.");
    }
    return {
      companyId: this.companyId,
      billedCompanyId: this.billedCompanyIdValue,
      clientele: clienteleOf(this.companyId),
      placedByUserId: this.placedByUserId,
      placedByStaffId: this.placedByStaffId,
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
      lines: this.lines.map((line) => line.toSnapshot()),
    };
  }
}
