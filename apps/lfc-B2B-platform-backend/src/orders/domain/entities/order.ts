import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type FulfillmentMethod,
  type PaymentStatus,
} from "@lfd/contracts";

import {
  EmptyOrderError,
  InvalidOrderFulfillmentError,
  InvalidOrderPaymentError,
} from "../errors/order-errors.js";
import { computeVatCents } from "../services/vat.js";
import {
  OrderLine,
  type OrderLineInput,
  type OrderLineSnapshot,
} from "../value-objects/order-line.js";

/** Acheminement demandé : coursier (zone + adresse libre) OU retrait (point figé). */
export interface OrderFulfillmentInput {
  readonly method: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
}

/** Ce qu'il faut pour **composer** une commande (prix/frais déjà résolus serveur). */
export interface DraftOrderInput {
  readonly companyId: string | null;
  /** Au nom de qui — toujours un client, même quand l'équipe saisit pour lui. */
  readonly placedByUserId: string;
  /** Qui l'a saisie chez LFC, ou `null` quand le client a commandé seul. */
  readonly placedByStaffId: string | null;
  readonly fulfillment: OrderFulfillmentInput;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly lines: readonly OrderLineInput[];
  /** Remise (retrait) déjà résolue, HT, en centimes. */
  readonly discountCents: number;
  /** L'ajustement qui l'a produite (taux ou montant), ou `null` si aucune. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Frais de livraison (zone) déjà résolu, HT, en centimes. */
  readonly deliveryFeeCents: number;
}

/** État de la commande sérialisé pour la persistance — aucun type Prisma ici. */
export interface OrderToPlace {
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly requestedDeliveryDate: Date | null;
  readonly note: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly paymentStatus: PaymentStatus;
  readonly stripePaymentIntentId: string | null;
  readonly lines: readonly OrderLineSnapshot[];
}

/**
 * L'ajustement figé doit **reproduire** le montant retenu. Sans ce contrôle, une
 * commande pourrait porter « −20 % » à côté d'une remise de 12 € : le libellé et
 * le chiffre se contrediraient sur la facture, et rien ne dirait lequel ment.
 *
 * @throws {InvalidOrderPaymentError} le libellé ne correspond pas au montant.
 */
function ensureDiscountMatches(input: DraftOrderInput, subtotalCents: number): void {
  if (input.discountAdjustment === null) {
    return;
  }
  if (cartAdjustmentCents(input.discountAdjustment, subtotalCents) !== input.discountCents) {
    throw new InvalidOrderPaymentError(
      "La remise retenue ne correspond pas à l'ajustement appliqué.",
    );
  }
}

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
    private readonly placedByUserId: string,
    private readonly placedByStaffId: string | null,
    private readonly fulfillment: OrderFulfillmentInput,
    private readonly requestedDeliveryDate: Date | null,
    private readonly note: string,
    private readonly lines: readonly OrderLine[],
    private readonly discountCents: number,
    private readonly discountAdjustment: CartAdjustment | null,
    private readonly deliveryFeeCents: number,
    private readonly subtotalCentsValue: number,
    private readonly vatCentsValue: number,
    private readonly totalCentsValue: number,
  ) {}

  /** Compose une commande : valide, fige les lignes et calcule tous les montants. */
  static draft(input: DraftOrderInput): Order {
    if (input.lines.length === 0) {
      throw new EmptyOrderError();
    }
    if (input.discountCents < 0 || input.deliveryFeeCents < 0) {
      throw new InvalidOrderPaymentError("Remise et frais doivent être positifs.");
    }
    const fulfillment = normalizeFulfillment(input.fulfillment);
    const lines = input.lines.map((line) => OrderLine.create(line));
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const vatCents = computeVatCents({
      lines: lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
      discountCents: input.discountCents,
      deliveryFeeCents: input.deliveryFeeCents,
    });
    ensureDiscountMatches(input, subtotalCents);
    const totalCents =
      Math.max(0, subtotalCents - input.discountCents) + input.deliveryFeeCents + vatCents;
    return new Order(
      input.companyId,
      input.placedByUserId,
      input.placedByStaffId,
      fulfillment,
      input.requestedDeliveryDate,
      input.note,
      lines,
      input.discountCents,
      input.discountAdjustment,
      input.deliveryFeeCents,
      subtotalCents,
      vatCents,
      totalCents,
    );
  }

  /** Total **TTC** à encaisser — la source pour dimensionner l'intention Stripe. */
  get totalCents(): number {
    return this.totalCentsValue;
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

  /** Sérialise pour l'adaptateur — refuse une commande au règlement non décidé. */
  toPersistence(): OrderToPlace {
    if (this.payment === null) {
      throw new InvalidOrderPaymentError("Le règlement de la commande n'est pas décidé.");
    }
    return {
      companyId: this.companyId,
      placedByUserId: this.placedByUserId,
      placedByStaffId: this.placedByStaffId,
      fulfillmentMethod: this.fulfillment.method,
      deliveryZoneId: this.fulfillment.deliveryZoneId,
      deliveryAddress: this.fulfillment.deliveryAddress,
      pickupAddress: this.fulfillment.pickupAddress,
      requestedDeliveryDate: this.requestedDeliveryDate,
      note: this.note,
      subtotalCents: this.subtotalCentsValue,
      discountCents: this.discountCents,
      discountAdjustment: this.discountAdjustment,
      deliveryFeeCents: this.deliveryFeeCents,
      vatCents: this.vatCentsValue,
      totalCents: this.totalCentsValue,
      paymentStatus: this.payment.status,
      stripePaymentIntentId: this.payment.intentId,
      lines: this.lines.map((line) => line.toSnapshot()),
    };
  }
}

/**
 * Coursier ⇒ zone + adresse requises, pas de point ; retrait ⇒ point requis, pas
 * de zone ni d'adresse. Coupe le résidu pour ne rien figer d'incohérent.
 */
function normalizeFulfillment(fulfillment: OrderFulfillmentInput): OrderFulfillmentInput {
  if (fulfillment.method === "delivery") {
    if (fulfillment.deliveryZoneId === null || fulfillment.deliveryAddress === null) {
      throw new InvalidOrderFulfillmentError("Un coursier exige une zone et une adresse.");
    }
    return {
      method: "delivery",
      deliveryZoneId: fulfillment.deliveryZoneId,
      deliveryAddress: fulfillment.deliveryAddress,
      pickupAddress: null,
    };
  }
  if (fulfillment.pickupAddress === null) {
    throw new InvalidOrderFulfillmentError("Un retrait exige un point de retrait.");
  }
  return {
    method: fulfillment.method,
    deliveryZoneId: null,
    deliveryAddress: null,
    pickupAddress: fulfillment.pickupAddress,
  };
}
