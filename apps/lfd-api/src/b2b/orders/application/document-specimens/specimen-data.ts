import {
  addDays,
  type BillingAddressPayload,
  type CartAdjustment,
  type ClientSheet,
  type ClientSheetLine,
  instantToLocal,
  type SheetVariant,
} from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { Order, type DraftOrderInput, type OrderToPlace } from "../../domain/entities/order.js";
import { frozenPickupDiscountBaseOf } from "../../domain/services/pickup-discount-base.js";
import { composeExactOrder } from "../../domain/services/exact-order-composition.js";
import { settlementRegimeOf } from "../../domain/services/settlement-regime.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";

/**
 * **Les données d'exemple du bon de commande** — la planche des documents de
 * la Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées.** La commande d'exemple passe par
 * `Order.draft` — le même agrégat, les mêmes gardes et le même calcul des
 * montants qu'une vraie commande — puis s'arrête à `toPersistence()`, qui ne
 * fait que la sérialiser : aucun dépôt ne la reçoit, aucun fait n'est publié,
 * aucun courriel ne part. Le bon qui en sort n'est pas archivé non plus.
 *
 * Tout ce qui désigne quelqu'un dit « EXEMPLE », pour qu'un papier égaré ne
 * passe jamais pour une vraie commande.
 */

/** La référence imprimée : ni un numéro de la séquence, ni un identifiant. */
export const SPECIMEN_REFERENCE = "EXEMPLE-0001";
const SPECIMEN_ORDER_ID = "specimen-order";
const SPECIMEN_COMPANY_ID = "specimen-company";

const PRO_CUSTOMER = {
  tradeName: "EXEMPLE — Hôtel des Trois Ponts",
  legalName: "EXEMPLE — SAS des Trois Ponts",
};
const PUBLIC_CUSTOMER = {
  tradeName: "EXEMPLE — Camille Martin",
  legalName: "EXEMPLE — Camille Martin",
};
const PUBLIC_PHONE = "06 00 00 00 00";

const DELIVERY_ADDRESS: BillingAddressPayload = {
  label: "Réception",
  ligne1: "EXEMPLE — 1 rue des Trois Ponts",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const PICKUP_ADDRESS: BillingAddressPayload = {
  label: "Le Labo",
  ligne1: "route de la Balme",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Deux taux : la boulangerie à 5,5 %, l'objet à 20 %. Prix en centimes, HT. */
const LINES: readonly OrderLineInput[] = [
  line("EXEMPLE-BAG", "Baguette tradition", 74, 5.5, 40),
  line("EXEMPLE-CRO", "Croissant pur beurre", 95, 5.5, 60),
  line("EXEMPLE-PAC", "Pain au chocolat", 105, 5.5, 30),
  line("EXEMPLE-TAS", "Tasse La Folie Coffee", 1250, 20, 2),
];

/**
 * Le panier du bon public : le même, la tasse **hors remise de retrait** —
 * c'est elle qui montre « sur X € éligibles » et l'astérisque (lot C du plan
 * des exclusions). Le drapeau est celui qu'une passation aurait figé.
 */
const PUBLIC_LINES: readonly OrderLineInput[] = LINES.map((input) =>
  input.sku === "EXEMPLE-TAS" ? { ...input, pickupDiscountEligible: false } : input,
);

/** La remise du point (5 %), et le barème d'une zone de livraison. */
const DISCOUNT: CartAdjustment = { mode: "percent", bp: 500 };
const DELIVERY_FEE_CENTS = 1_500;
const DELIVERY_FEE: CartAdjustment = { mode: "amount", cents: DELIVERY_FEE_CENTS };

const NOTE = "EXEMPLE — Livrer par l'entrée de service, sonner à la réception.";

function line(
  sku: string,
  productName: string,
  priceCents: number,
  vatRate: number,
  quantity: number,
): OrderLineInput {
  return {
    sku,
    productName,
    unitPriceMillicents: millicentsFromCents(priceCents),
    vatRate,
    quantity,
    saleUnit: "piece",
  };
}

/**
 * La commande d'exemple de la variante demandée, composée par l'agrégat.
 *
 * 🔴 **Seul le bon public porte la remise** : elle est celle d'un point de
 * retrait, et le bon pro part en livraison avec son port. Les deux ensemble
 * sont refusés par l'agrégat (V5 du plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, 2026-10-22).
 *
 * La remise se calcule sur l'assiette TTC des lignes éligibles, par
 * `composeExactOrder` — exactement la garde que l'agrégat refait.
 */
function specimenOrder(variant: SheetVariant, requestedFor: Date): Order {
  if (variant === "pro") {
    return Order.draft(proInput(requestedFor));
  }
  const base = publicInput(requestedFor);
  // Le bon public est celui d'un particulier : sa commande est composée en
  // TTC (`exact_ht`, plan du centime, lot C2), et la remise y arrive en TTC —
  // par la composition même que l'agrégat rejoue pour la vérifier.
  const composed = composeExactOrder({
    lines: base.lines,
    discountAdjustment: DISCOUNT,
    deliveryFeeAdjustment: null,
    deliveryVatMode: base.deliveryVatMode,
    voucherFaceCents: 0,
  });
  return Order.draft({
    ...base,
    discountCents: composed.pickupDiscount.ttcCents,
    discountAdjustment: DISCOUNT,
  });
}

/** Ce que les deux variantes partagent — tout sauf qui commande et comment ça part. */
type CommonInput = Omit<
  DraftOrderInput,
  | "companyId"
  | "billedCompanyId"
  | "fulfillment"
  | "agreed"
  | "deliveryFeeCents"
  | "deliveryFeeAdjustment"
>;

function common(requestedFor: Date): CommonInput {
  return {
    principal: null,
    placedByUserId: "specimen-user",
    placedByStaffId: null,
    requestedDeliveryDate: requestedFor,
    note: NOTE,
    catalogVersionId: null,
    lines: LINES,
    discountCents: 0,
    discountAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
  };
}

function proInput(requestedFor: Date): DraftOrderInput {
  return {
    ...common(requestedFor),
    companyId: SPECIMEN_COMPANY_ID,
    billedCompanyId: SPECIMEN_COMPANY_ID,
    fulfillment: {
      method: "delivery",
      deliveryZoneId: "specimen-zone",
      deliveryAddress: DELIVERY_ADDRESS,
      deliveryAddressId: null,
      pickupAddress: null,
    },
    agreed: {
      window: { value: { start: "07:00", end: "08:30" }, source: "override" },
      contact: {
        value: { prenom: "EXEMPLE", nom: "Réception", telephone: "04 00 00 00 00" },
        source: "override",
      },
      signatureRequired: { value: true, source: "override" },
    },
    // Un montant fixe : le barème ne dépend pas du panier.
    deliveryFeeCents: DELIVERY_FEE_CENTS,
    deliveryFeeAdjustment: DELIVERY_FEE,
  };
}

function publicInput(requestedFor: Date): DraftOrderInput {
  return {
    ...common(requestedFor),
    lines: PUBLIC_LINES,
    companyId: null,
    billedCompanyId: null,
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: PICKUP_ADDRESS,
    },
    agreed: {
      window: { value: { start: "08:00", end: "09:00" }, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
  };
}

/**
 * **Le bon client d'exemple**, pro ou public, daté de `now`.
 *
 * Le pro est réglé au compte (différé) ; le public a payé par carte — son
 * régime est lu par `settlementRegimeOf`, comme celui d'une vraie commande.
 */
export function specimenClientSheet(variant: SheetVariant, now: Date): ClientSheet {
  const order = specimenOrder(variant, tomorrowOf(now));
  if (variant === "pro") {
    order.deferPayment();
  } else {
    order.payByCard("specimen-payment");
  }
  const state = order.toPersistence();
  const settlement =
    variant === "pro" ? order.settlementRegime : settlementRegimeOf("paid", state.totalCents);
  return sheetOf(state, variant, settlement, now);
}

/** Le jumeau de `clientSheetOf`, lu sur l'état sérialisé au lieu d'une vue relue. */
function sheetOf(
  state: OrderToPlace,
  variant: SheetVariant,
  settlement: ClientSheet["money"]["settlement"],
  now: Date,
): ClientSheet {
  const agreedContact = state.agreed.contact.value;
  return {
    orderId: SPECIMEN_ORDER_ID,
    reference: SPECIMEN_REFERENCE,
    placedAt: now.toISOString(),
    requestedFor: state.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    fulfillment: {
      method: state.fulfillmentMethod,
      address: state.fulfillmentMethod === "delivery" ? state.deliveryAddress : state.pickupAddress,
      pickupLabel: state.fulfillmentMethod === "pickup" ? PICKUP_ADDRESS.label : null,
      window: state.agreed.window.value,
      contact:
        agreedContact === null
          ? null
          : {
              source: "order",
              name: `${agreedContact.prenom} ${agreedContact.nom}`,
              phone: agreedContact.telephone,
            },
      signatureRequired: state.agreed.signatureRequired.value,
    },
    note: state.note,
    origin: "self_service",
    issuedAt: now.toISOString(),
    revision: 0,
    audience: "client",
    customer: variant === "pro" ? PRO_CUSTOMER : PUBLIC_CUSTOMER,
    variant,
    customerPhone: variant === "pro" ? null : PUBLIC_PHONE,
    lines: state.lines.map((snapshot): ClientSheetLine => ({
      sku: snapshot.sku,
      productName: snapshot.productName,
      quantity: snapshot.quantity,
      unitPriceMillicents: snapshot.unitPriceMillicents,
      vatRate: snapshot.vatRate,
      lineTotalCents: snapshot.lineTotalCents,
      unitPriceTtcCents: snapshot.unitPriceTtcCents,
      lineTotalTtcCents: snapshot.lineTotalTtcCents,
      priceLabels: [],
      ...(snapshot.pickupDiscountEligible ? {} : { pickupDiscountEligible: false as const }),
    })),
    money: {
      subtotalCents: state.subtotalCents,
      discountCents: state.discountCents,
      discountAdjustment: state.discountAdjustment,
      voucherDiscountCents: state.voucherDiscountCents,
      deliveryFeeCents: state.deliveryFeeCents,
      lateFeeCents: state.lateFeeCents,
      vatCents: state.vatCents,
      vatShares: state.vatShares,
      totalCents: state.totalCents,
      currency: "EUR",
      settlement,
      ...frozenPickupDiscountBaseOf({
        discountCents: state.discountCents,
        lines: state.lines.map((snapshot) => ({
          sku: snapshot.sku,
          lineTotalCents: snapshot.lineTotalCents,
          lineTotalTtcCents: snapshot.lineTotalTtcCents,
          ...(snapshot.pickupDiscountEligible ? {} : { pickupDiscountEligible: false as const }),
        })),
      }),
    },
  };
}

/**
 * La commande pro d'exemple, sérialisée — ce que la facture d'exemple lit
 * comme son bon figé. Une seule source pour les deux documents : la facture
 * de la planche reprend les montants du bon de la planche, au centime.
 */
export function specimenProOrderState(now: Date): OrderToPlace {
  const order = specimenOrder("pro", tomorrowOf(now));
  order.deferPayment();
  return order.toPersistence();
}

/** Le lendemain de `now` à Paris, en jour de service (minuit UTC, comme la colonne). */
function tomorrowOf(now: Date): Date {
  return new Date(`${addDays(instantToLocal(now).day, 1)}T00:00:00.000Z`);
}
