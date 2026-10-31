import type {
  CarrierNote,
  CarrierNoteLine,
  ClientNote,
  ClientNoteLine,
  SheetCustomer,
  SheetDiscountLine,
  SheetFulfillment,
  SheetMoney,
  SheetVariant,
  StaffNote,
  VatShareView,
} from "@lfd/contracts";

import { reprintNeededOf, type DeliveryNoteState } from "../entities/delivery-note.js";
import { DeliveryNoteWithoutTermsError } from "../errors/delivery-note-errors.js";
import type { DeliveryNoteLineState } from "../value-objects/delivery-note-line.js";
import type {
  DeliveryNoteTerms,
  DeliveryNoteTtcTerms,
  FrozenJson,
} from "../value-objects/delivery-note-terms.js";

/**
 * **La projection d'un bon de livraison, par lecteur** (plan
 * plan E5a (`documentation/commandes/bon-de-livraison.md`), § 1).
 *
 * Trois fonctions nommées, jamais un aiguilleur `noteOf(note, audience)` : la
 * route qui recevrait l'audience en paramètre laisserait le demandeur choisir
 * s'il lit les prix — ce que le bon de commande a déjà écarté
 * (`orders/domain/services/order-sheet.ts`).
 *
 * Pures : ni horloge, ni port. Le BL fournit ce qu'il porte (numéro, lignes,
 * totaux, état) ; la commande fournit ce que le BL ne recopie pas (le client,
 * l'acheminement, la note) par {@link DeliveryNoteOrderHead}.
 */

/** Ce que la commande dit du BL : qui, où, quand. Aucun montant. */
export interface DeliveryNoteOrderHead {
  readonly orderId: string;
  readonly reference: string;
  readonly placedAt: string;
  readonly requestedFor: string | null;
  readonly customer: SheetCustomer;
  readonly fulfillment: SheetFulfillment;
  readonly note: string;
}

/**
 * Ce que le BL client lit de plus sur la commande : la variante, le téléphone
 * du particulier, et les métadonnées de ses montants que le BL ne recopie pas
 * (le geste de remise, la devise, le régime, l'assiette de la remise de retrait).
 */
export interface DeliveryNoteOrderBilling {
  readonly variant: SheetVariant;
  readonly customerPhone: string | null;
  readonly money: Pick<
    SheetMoney,
    "discountAdjustment" | "currency" | "settlement" | "pickupDiscountBase"
  >;
}

/** La part d'une remise sur ce bon, avec le libellé figé de la remise (`null` sans libellé). */
export interface NoteDiscountPartView {
  readonly label: string | null;
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
}

/** Le libellé d'une remise sans libellé figé (plan des promotions, § 18.4). */
export const DISCOUNT_FALLBACK_LABEL = "Remise";

/**
 * Les lignes de remise du bon, une par part (`delivery_note_discounts`, dans
 * l'ordre des rangs) — seulement s'il en porte PLUSIEURS : une seule remise
 * garde la ligne d'hier, son libellé de point et d'assiette compris.
 */
function discountLinesOf(
  parts: readonly NoteDiscountPartView[],
): Pick<SheetMoney, "discountLines"> {
  if (parts.length < 2) {
    return {};
  }
  const discountLines: SheetDiscountLine[] = parts.map((part) => ({
    label: part.label ?? DISCOUNT_FALLBACK_LABEL,
    cents: part.amountCents,
    ttcCents: part.amountTtcCents,
  }));
  return { discountLines };
}

/** L'instant du dernier pas du BL — pas celui du rendu. */
function issuedAtOf(note: DeliveryNoteState): string {
  return (note.handedOverAt ?? note.preparedAt ?? note.plannedAt).toISOString();
}

function commonOf(note: DeliveryNoteState, head: DeliveryNoteOrderHead) {
  return {
    number: note.number,
    orderId: head.orderId,
    orderReference: head.reference,
    orderPlacedAt: head.placedAt,
    requestedFor: head.requestedFor,
    receivedOn: note.receivedOn,
    customer: head.customer,
    fulfillment: head.fulfillment,
    note: head.note,
    issuedAt: issuedAtOf(note),
  };
}

function carrierLineOf(line: DeliveryNoteLineState): CarrierNoteLine {
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    // Écrite pour le poids seul, comme sur le bon de commande : un BL à la
    // pièce se rend au bit près comme avant (P5).
    ...(line.saleUnit === "weight" ? { saleUnit: "weight" as const } : {}),
  };
}

function clientLineOf(line: DeliveryNoteLineState): ClientNoteLine {
  return {
    ...carrierLineOf(line),
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    lineTotalCents: line.lineTotalCents,
    unitPriceTtcCents: line.unitPriceTtcCents,
    lineTotalTtcCents: line.lineTotalTtcCents,
    ...(line.pickupDiscountEligible === false ? { pickupDiscountEligible: false as const } : {}),
  };
}

function isVatShare(value: FrozenJson): value is { rate: number; amountCents: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "rate" in value &&
    "amountCents" in value &&
    typeof value["rate"] === "number" &&
    Number.isSafeInteger(value["amountCents"])
  );
}

/**
 * La TVA par taux, lue dans la valeur recopiée telle quelle (E4a). Une forme
 * qu'on ne reconnaît pas rend `null` : le papier dit alors « dont TVA » au
 * total, ce qui est vrai, plutôt qu'un détail deviné.
 */
export function vatSharesOf(frozen: FrozenJson | null): readonly VatShareView[] | null {
  if (frozen === null || !Array.isArray(frozen)) {
    return null;
  }
  const shares: readonly FrozenJson[] = frozen;
  return shares.every(isVatShare)
    ? shares.filter(isVatShare).map((s) => ({ rate: s.rate, amountCents: s.amountCents }))
    : null;
}

/**
 * Les montants **du BL**, recopiés de sa commande à la prévision (E4a).
 *
 * @throws {DeliveryNoteWithoutTermsError} le BL est antérieur à E4a et n'a pas encore son en-tête.
 */
function moneyOf(
  note: DeliveryNoteState,
  billing: DeliveryNoteOrderBilling,
  parts: readonly NoteDiscountPartView[],
): SheetMoney {
  if (note.terms === null) {
    throw new DeliveryNoteWithoutTermsError(note.number);
  }
  return moneyFrom(note.terms, billing, parts);
}

function moneyFrom(
  terms: DeliveryNoteTerms,
  billing: DeliveryNoteOrderBilling,
  parts: readonly NoteDiscountPartView[],
): SheetMoney {
  const { pickupDiscountBase, ...meta } = billing.money;
  return {
    subtotalCents: terms.subtotalCents,
    discountCents: terms.discountCents,
    voucherDiscountCents: terms.voucherDiscountCents,
    deliveryFeeCents: terms.deliveryFeeCents,
    lateFeeCents: terms.lateFeeCents,
    vatCents: terms.vatCents,
    vatShares: vatSharesOf(terms.vatShares),
    totalCents: terms.totalCents,
    ...meta,
    ...(pickupDiscountBase === undefined ? {} : { pickupDiscountBase }),
    ...discountLinesOf(parts),
    // Les TTC du BL lui-même — recomposés sur le livré (plan du centime, § 5).
    ...(terms.ttcTerms === null ? {} : ttcFieldsOf(terms.ttcTerms)),
  };
}

/** Les TTC du BL pour sa feuille : ses gestes, et la part de chaque taux quand elle est figée. */
function ttcFieldsOf(ttc: DeliveryNoteTtcTerms): Pick<SheetMoney, "ttcTerms" | "ttcByRate"> {
  const { byRate, ...gestures } = ttc;
  return { ttcTerms: gestures, ...(byRate === null ? {} : { ttcByRate: byRate }) };
}

/**
 * Le BL **de transport** : colisage, livreur, personne qui réceptionne.
 * Articles et quantités, **aucun montant** — le type n'a pas la propriété.
 */
export function carrierNoteOf(note: DeliveryNoteState, head: DeliveryNoteOrderHead): CarrierNote {
  return { ...commonOf(note, head), audience: "carrier", lines: note.lines.map(carrierLineOf) };
}

function pricedShapeOf(
  note: DeliveryNoteState,
  head: DeliveryNoteOrderHead,
  billing: DeliveryNoteOrderBilling,
) {
  return {
    ...commonOf(note, head),
    variant: billing.variant,
    customerPhone: billing.variant === "pro" ? null : billing.customerPhone,
    lines: note.lines.map(clientLineOf),
  };
}

/**
 * Le BL **client** : chiffré, pro (HT) ou public (TTC) comme le bon de commande.
 * `parts` : ses parts par remise, figées au départ (vide = la ligne d'hier).
 *
 * @throws {DeliveryNoteWithoutTermsError} le BL n'a pas encore son en-tête.
 */
export function clientNoteOf(
  note: DeliveryNoteState,
  head: DeliveryNoteOrderHead,
  billing: DeliveryNoteOrderBilling,
  parts: readonly NoteDiscountPartView[] = [],
): ClientNote {
  return {
    ...pricedShapeOf(note, head, billing),
    money: moneyOf(note, billing, parts),
    audience: "client",
  };
}

/**
 * Le BL **de l'équipe** : le client, plus l'état et ses dates. Sans en-tête
 * (BL d'avant E4a), ses montants sont `null` : l'équipe voit le BL, elle ne
 * lit pas de totaux qu'il ne porte pas.
 */
export function staffNoteOf(
  note: DeliveryNoteState,
  head: DeliveryNoteOrderHead,
  billing: DeliveryNoteOrderBilling,
  parts: readonly NoteDiscountPartView[] = [],
): StaffNote {
  return {
    ...pricedShapeOf(note, head, billing),
    money: note.terms === null ? null : moneyFrom(note.terms, billing, parts),
    audience: "staff",
    status: note.status,
    plannedAt: note.plannedAt.toISOString(),
    preparedAt: note.preparedAt?.toISOString() ?? null,
    handedOverAt: note.handedOverAt?.toISOString() ?? null,
    voidedAt: note.voidedAt?.toISOString() ?? null,
    reprintNeeded: reprintNeededOf(note),
  };
}
