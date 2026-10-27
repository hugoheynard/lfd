import {
  ORDER_REVISION_CHANGES,
  // Aliasé comme dans `order.ts` : `OrderFulfillmentInput` désigne le mode + les adresses.
  type OrderFulfillment as AgreedFulfillment,
  type ContentLocale,
  type DeliveryVatMode,
  type LateFeeAdjustment,
  type OrderRevisionChange,
  type OrderStatus,
  type PaymentStatus,
} from "@lfd/contracts";

import {
  CardOrderNotRevisableError,
  FrozenLinePriceChangedError,
  RevisionBelowVoucherError,
  RevisionFreesAccountOrderError,
  RevisionRequiresPaymentError,
  ShortfallDecidedRevisionError,
  UnchangedOrderRevisionError,
} from "../errors/order-revision-errors.js";
import type { FixedCustomerCancellation } from "../services/customer-cancellation-window.js";
import { isCardSettlement } from "../services/order-revisability.js";
import { settlementRegimeOf } from "../services/settlement-regime.js";
import type { OrderLineSnapshot } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { RefundPosition } from "./order-refund.js";
import type {
  OrderFulfillmentInput,
  OrderPrincipal,
  OrderSalesTerms,
  OrderToPlace,
} from "./order-shapes.js";

/**
 * **La commande telle qu'on la modifie** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) : sa révision
 * courante, ce qui ne change pas (payeur, société, clientèle, CGV, langue,
 * surtaxe), et la composition qu'une révision remplace.
 */
export interface RevisableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** `0` à la passation, `+1` à chaque modification (R7). */
  readonly revision: number;
  readonly companyId: string | null;
  readonly billedCompanyId: string | null;
  readonly principal: OrderPrincipal | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  /**
   * Son départ incomplet est décidé (E6b) : elle ne se modifie plus, pour que
   * la décision et la commande ne divergent jamais. Relu sous le verrou de
   * `orders` par la révision (`OrderRevisionRepository.lock`).
   */
  readonly shortfallDecided: boolean;
  readonly stripePaymentIntentId: string | null;
  readonly cancelledAt: Date | null;
  readonly refunds: RefundPosition;
  /** Le jour de service `AAAA-MM-JJ`, ou `null`. */
  readonly serviceDay: string | null;
  readonly fulfillment: OrderFulfillmentInput;
  readonly agreed: AgreedFulfillment;
  readonly note: string;
  readonly lines: readonly OrderLineSnapshot[];
  /**
   * Le mode de TVA du port figé à la passation (V3), repris par la révision ;
   * `null` sur une commande d'avant le réglage — la révision lit alors le
   * réglage, comme la passation l'aurait fait.
   */
  readonly deliveryVatMode: DeliveryVatMode | null;
  /** L'ajustement de la surtaxe tardive figé à la passation, `null` sans surtaxe (R4). */
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
  /**
   * Comment ses montants ont été composés — relu sur la commande, jamais sur
   * sa clientèle : une commande `line_ht` révisée reste `line_ht` (plan du
   * centime, § 5, « La révision d'une commande »).
   */
  readonly vatMethod: OrderVatMethod;
  /**
   * Le bon imputé à la passation, et ce qu'il a servi **dans l'unité de la
   * méthode** : HT pour `line_ht`, valeur faciale TTC pour `exact_ht`.
   */
  readonly voucher: { readonly id: string; readonly appliedCents: number } | null;
  /** `null` sur une commande d'avant les CGV figées — elle ne se modifie pas. */
  readonly salesTerms: OrderSalesTerms | null;
  readonly locale: ContentLocale | null;
  readonly catalogVersionId: string | null;
  /** Le délai d'annulation figé à la passation — la révision le reporte. */
  readonly customerCancellation: FixedCustomerCancellation;
  /** L'instant figé ; seul, il dit le délai d'une commande d'avant la colonne du délai. */
  readonly customerCancellableUntil: Date | null;
}

/**
 * Qui modifie : le client (sous son mur, jusqu'à l'heure limite) ou l'équipe
 * (jusqu'à l'inscription au fournil) — R1.
 */
export type RevisionActor =
  | { readonly kind: "customer"; readonly userId: string }
  | { readonly kind: "staff"; readonly staffId: string };

/** Ce qu'une révision change — le résumé du fait `order.revised` (valeurs du contrat). */
export const REVISION_CHANGES = ORDER_REVISION_CHANGES;
export type RevisionChange = OrderRevisionChange;

/** Les changements qui déplacent la commande pour la livraison (transfert, géocodage). */
const ROUTE_CHANGES: ReadonlySet<RevisionChange> = new Set([
  "date",
  "method",
  "pickup_point",
  "delivery_address",
]);

/**
 * **Une révision prête à écrire** : la nouvelle composition (`state`, la forme
 * de la passation), la révision qu'elle corrige, et ce qu'elle a changé.
 */
export interface OrderRevisionToSave {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  /** La révision corrigée — l'écriture est conditionnée sur elle (R7). */
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly previousServiceDay: string | null;
  readonly serviceDay: string | null;
  readonly state: OrderToPlace;
  readonly changes: readonly RevisionChange[];
  readonly totalBeforeCents: number;
  readonly totalAfterCents: number;
  /** Mode, date, point ou adresse ont changé : la livraison doit la reprendre. */
  readonly routeChanged: boolean;
  /** Au compte : la ligne d'encaissement suit le nouveau total. */
  readonly onAccount: boolean;
}

/**
 * **M1 ne modifie que les commandes au compte et à total nul** (§9 du plan) :
 * une commande payable par carte — payée, ou intention en attente — a une
 * seule intention et une seule demande de remboursement, et sa modification
 * est le lot M2, à concevoir.
 *
 * @throws {CardOrderNotRevisableError} règlement par carte attendu ou encaissé.
 */
export function ensureRevisableSettlement(order: RevisableOrder): void {
  if (isCardSettlement(order.paymentStatus, order.totalCents)) {
    throw new CardOrderNotRevisableError(order.orderId);
  }
}

/**
 * Une commande dont le départ incomplet est décidé ne se modifie plus (E6b,
 * plan E6 § 12.2) : la décision et la commande ne divergent jamais. Jugé par
 * {@link Order.recompose} et, sous le verrou, par la révision.
 *
 * @throws {ShortfallDecidedRevisionError}
 */
export function ensureNoShortfallDecision(order: RevisableOrder): void {
  if (order.shortfallDecided) {
    throw new ShortfallDecidedRevisionError(order.orderId);
  }
}

/**
 * **La révision, jugée sur la nouvelle composition** : prix figés tenus (R3),
 * bon imputé couvert (R4), régime inchangé (M1). Le « au moins un changement »
 * (R6) est à part ({@link ensureChanged}) : le devis montre aussi un panier
 * qu'on n'a pas encore touché.
 *
 * @throws {FrozenLinePriceChangedError} une ligne déjà présente a changé de prix.
 * @throws {RevisionBelowVoucherError} le total passerait sous le bon imputé.
 * @throws {RevisionRequiresPaymentError} une commande gratuite deviendrait payante.
 * @throws {RevisionFreesAccountOrderError} une commande au compte deviendrait gratuite.
 */
export function revisionOf(order: RevisableOrder, state: OrderToPlace): OrderRevisionToSave {
  ensureFrozenPrices(order.lines, state);
  ensureVoucherCovered(order, state);
  const before = settlementRegimeOf(order.paymentStatus, order.totalCents);
  const after = settlementRegimeOf(state.paymentStatus, state.totalCents);
  if (before === "free" && after !== "free") {
    throw new RevisionRequiresPaymentError(order.orderId, state.totalCents);
  }
  if (before === "account" && after !== "account") {
    throw new RevisionFreesAccountOrderError(order.orderId);
  }
  const changes = changesOf(order, state);
  const serviceDay = dayOf(state.requestedDeliveryDate);
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    placedByUserId: order.placedByUserId,
    fromRevision: order.revision,
    toRevision: order.revision + 1,
    previousServiceDay: order.serviceDay,
    serviceDay,
    state,
    changes,
    totalBeforeCents: order.totalCents,
    totalAfterCents: state.totalCents,
    routeChanged: changes.some((change) => ROUTE_CHANGES.has(change)),
    onAccount: after === "account",
  };
}

/**
 * R6 : une modification qui ne change rien est refusée — elle ne crée pas de
 * révision vide.
 *
 * @throws {UnchangedOrderRevisionError} aucun changement.
 */
export function ensureChanged(revision: OrderRevisionToSave): void {
  if (revision.changes.length === 0) {
    throw new UnchangedOrderRevisionError(revision.orderId);
  }
}

/** R3 : le prix unitaire et le taux d'une ligne déjà présente ne bougent pas. */
function ensureFrozenPrices(previous: readonly OrderLineSnapshot[], state: OrderToPlace): void {
  const before = new Map(previous.map((line) => [line.sku, line]));
  for (const line of state.lines) {
    const kept = before.get(line.sku);
    if (
      kept !== undefined &&
      (kept.unitPriceMillicents !== line.unitPriceMillicents || kept.vatRate !== line.vatRate)
    ) {
      throw new FrozenLinePriceChangedError(line.sku);
    }
  }
}

/** R4 : le bon déjà imputé reste imputé en entier — sa restitution partielle n'existe pas. */
function ensureVoucherCovered(order: RevisableOrder, state: OrderToPlace): void {
  // Dans l'unité de la méthode : la valeur faciale TTC pour `exact_ht`.
  const served = state.voucherTtcCents ?? state.voucherDiscountCents;
  if (order.voucher !== null && served < order.voucher.appliedCents) {
    throw new RevisionBelowVoucherError(order.orderId, order.voucher.appliedCents);
  }
}

function changesOf(order: RevisableOrder, state: OrderToPlace): RevisionChange[] {
  const before = order.fulfillment;
  const candidates: readonly (readonly [RevisionChange, boolean])[] = [
    ["lines", !sameValue(linesKey(order.lines), linesKey(state.lines))],
    ["date", order.serviceDay !== dayOf(state.requestedDeliveryDate)],
    ["method", before.method !== state.fulfillmentMethod],
    [
      "pickup_point",
      !sameValue(before.pickupAddress?.siteId ?? null, state.pickupAddress?.siteId ?? null),
    ],
    ["delivery_address", !sameValue(before.deliveryAddress, state.deliveryAddress)],
    ["window", !sameValue(order.agreed.window.value, state.agreed.window.value)],
    ["contact", !sameValue(order.agreed.contact.value, state.agreed.contact.value)],
    ["signature", order.agreed.signatureRequired.value !== state.agreed.signatureRequired.value],
    ["note", order.note !== state.note],
  ];
  return candidates.filter(([, changed]) => changed).map(([change]) => change);
}

/** Les lignes comparables : SKU et quantité, dans un ordre stable. */
function linesKey(lines: readonly { readonly sku: string; readonly quantity: number }[]) {
  return lines
    .map((line) => [line.sku, line.quantity] as const)
    .sort(([a], [b]) => a.localeCompare(b));
}

function dayOf(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** Égalité de valeur, insensible à l'ordre des clés d'un objet (snapshot relu vs reçu). */
function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}
