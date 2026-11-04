/**
 * **Ce que le golden master enregistre** de chaque chemin : une seule forme de
 * montants, et le refus par son CODE, jamais par son texte (plan
 * `le-prix-d-un-panier.md`, §3 G2). Un champ que le chemin ne rend pas
 * vaut `null` : le devis du simulateur s'arrête au sous-total.
 */
import type request from "supertest";

import type { PrismaService } from "../src/platform/database/prisma.service.js";

export interface RecordedLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceMillicents: number;
  /** `null` au devis du simulateur, qui ne rend que le prix unitaire. */
  readonly lineTotalCents: number | null;
  readonly lineTotalTtcCents: number | null;
}

export interface RecordedVat {
  readonly rate: number;
  readonly amountCents: number;
}

export interface RecordedAmounts {
  readonly vatMethod: string | null;
  readonly subtotalCents: number;
  readonly discountCents: number | null;
  /** Une remise par étape, dans l'ordre d'application. */
  readonly discounts: readonly number[] | null;
  readonly voucherCents: number | null;
  readonly deliveryFeeCents: number | null;
  readonly lateFeeCents: number | null;
  readonly vat: readonly RecordedVat[] | null;
  readonly vatCents: number | null;
  readonly totalCents: number | null;
  readonly lines: readonly RecordedLine[];
}

/** La sortie d'un chemin : son statut, son code de refus, ses montants. */
export interface Recorded {
  readonly status: number;
  readonly code: string | null;
  readonly amounts: RecordedAmounts | null;
  /** Ce que seul ce chemin dit : avertissements, écart d'une révision… */
  readonly notes: Readonly<Record<string, number | string | null>>;
}

// --- lecture prudente d'un corps JSON, sans cast -------------------------

type Json = Record<string, unknown>;

export function asObject(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function int(value: unknown): number {
  return num(value) ?? Number.NaN;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bySku(lines: readonly RecordedLine[]): readonly RecordedLine[] {
  return [...lines].sort((a, b) => a.sku.localeCompare(b.sku) || a.quantity - b.quantity);
}

function lineOf(raw: unknown): RecordedLine {
  const line = asObject(raw);
  return {
    sku: str(line["sku"]) ?? "?",
    quantity: int(line["quantity"]),
    unitPriceMillicents: int(line["unitPriceMillicents"]),
    lineTotalCents: int(line["lineTotalCents"]),
    lineTotalTtcCents: num(line["lineTotalTtcCents"]),
  };
}

function vatOf(raw: unknown, amountKey: string): readonly RecordedVat[] {
  return list(raw)
    .map((share) => asObject(share))
    .map((share) => ({ rate: int(share["rate"]), amountCents: int(share[amountKey]) }))
    .sort((a, b) => a.rate - b.rate);
}

/** Un refus : le code de l'enveloppe d'erreur, rien d'autre. */
export function refusalOf(response: request.Response): Recorded {
  return {
    status: response.status,
    code: str(asObject(response.body)["code"]),
    amounts: null,
    notes: {},
  };
}

/** `ShopQuoteView` — le devis de la boutique et de l'espace pro. */
export function fromShopQuote(response: request.Response): Recorded {
  if (response.status !== 200) return refusalOf(response);
  const view = asObject(response.body);
  const discounts = list(view["discounts"]).map((entry) => int(asObject(entry)["amountCents"]));
  const vat = vatOf(view["vat"], "amountCents");
  return {
    status: response.status,
    code: null,
    amounts: {
      vatMethod: null,
      subtotalCents: int(view["subtotalHtCents"]),
      discountCents: int(view["discountCents"]),
      discounts:
        discounts.length > 0 ? discounts : [int(view["discountCents"])].filter((c) => c > 0),
      voucherCents: int(view["voucherDiscountCents"]),
      deliveryFeeCents: int(view["deliveryFeeCents"]),
      // Absente à zéro (T1) : `null` = « le devis n'en dit rien ».
      lateFeeCents: num(view["lateFeeCents"]),
      vat,
      vatCents: vat.reduce((sum, share) => sum + share.amountCents, 0),
      totalCents: int(view["totalCents"]),
      lines: bySku(list(view["lines"]).map(lineOf)),
    },
    notes: {
      removedLines: list(view["removedLines"]).length,
      voucherTotalEffectCents: num(view["voucherTotalEffectCents"]),
    },
  };
}

/** `OrderQuoteView` / `CustomerOrderQuoteView` — sous-total et prix de ligne. */
export function fromOrderQuote(response: request.Response): Recorded {
  if (response.status !== 200) return refusalOf(response);
  const view = asObject(response.body);
  const lines = list(view["lines"]).map((raw) => {
    const line = asObject(raw);
    return {
      sku: str(line["sku"]) ?? "?",
      quantity: int(line["quantity"]),
      unitPriceMillicents: int(line["unitPriceMillicents"]),
      lineTotalCents: null,
      lineTotalTtcCents: null,
    };
  });
  return {
    status: response.status,
    code: null,
    amounts: {
      vatMethod: null,
      subtotalCents: int(view["subtotalCents"]),
      discountCents: null,
      discounts: null,
      voucherCents: null,
      deliveryFeeCents: null,
      lateFeeCents: null,
      vat: null,
      vatCents: null,
      totalCents: null,
      lines: bySku(lines),
    },
    notes: { cutoff: str(asObject(view["cutoff"])["status"]) },
  };
}

/** `AdminOrderEstimateView` — l'estimation de la saisie. */
export function fromEstimate(response: request.Response): Recorded {
  if (response.status !== 200) return refusalOf(response);
  const view = asObject(response.body);
  const refusal = asObject(view["refusal"]);
  const warnings = list(view["warnings"]).map((w) => str(asObject(w)["code"]) ?? "?");
  const notes = {
    warnings: warnings.join(",") || null,
    cutoff: str(asObject(view["cutoff"])["status"]),
  };
  if (view["amounts"] === null) {
    return { status: response.status, code: str(refusal["code"]), amounts: null, notes };
  }
  const amounts = asObject(view["amounts"]);
  return {
    status: response.status,
    code: null,
    amounts: {
      vatMethod: str(amounts["vatMethod"]),
      subtotalCents: int(amounts["subtotalCents"]),
      discountCents: int(amounts["discountCents"]),
      discounts: list(amounts["discounts"]).map((entry) => int(asObject(entry)["amountCents"])),
      voucherCents: null,
      deliveryFeeCents: int(amounts["deliveryFeeCents"]),
      lateFeeCents: int(amounts["lateFeeCents"]),
      vat: vatOf(amounts["vatShares"], "amountCents"),
      vatCents: int(amounts["vatCents"]),
      totalCents: int(amounts["totalCents"]),
      lines: bySku(list(amounts["lines"]).map(lineOf)),
    },
    notes,
  };
}

/** `OrderRevisionQuoteView` — le devis d'une révision. */
export function fromRevisionQuote(response: request.Response): Recorded {
  if (response.status !== 200) return refusalOf(response);
  const view = asObject(response.body);
  return {
    status: response.status,
    code: null,
    amounts: {
      vatMethod: null,
      subtotalCents: int(view["subtotalCents"]),
      discountCents: int(view["discountCents"]),
      discounts: null,
      voucherCents: int(view["voucherDiscountCents"]),
      deliveryFeeCents: int(view["deliveryFeeCents"]),
      lateFeeCents: int(view["lateFeeCents"]),
      vat: null,
      vatCents: int(view["vatCents"]),
      totalCents: int(view["totalCents"]),
      lines: bySku(list(view["lines"]).map(lineOf)),
    },
    notes: {
      previousTotalCents: int(view["previousTotalCents"]),
      differenceCents: int(view["differenceCents"]),
      lineRefusals: list(view["lines"]).filter((l) => asObject(l)["refusal"] !== null).length,
    },
  };
}

/**
 * Une commande écrite, relue dans ses COLONNES — ce qu'une facture relira,
 * pas une seconde réponse HTTP.
 */
export async function fromOrderRow(
  prisma: PrismaService,
  status: number,
  orderId: string,
  notes: Recorded["notes"] = {},
): Promise<Recorded> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      vatMethod: true,
      subtotalCents: true,
      discountCents: true,
      voucherDiscountCents: true,
      deliveryFeeCents: true,
      lateFeeCents: true,
      vatShares: true,
      ttcByRate: true,
      vatCents: true,
      totalCents: true,
      lines: {
        select: {
          sku: true,
          quantity: true,
          unitPriceMillicents: true,
          lineTotalCents: true,
          lineTotalTtcCents: true,
        },
      },
      discounts: {
        where: { archivedAt: null },
        orderBy: { rank: "asc" },
        select: { amountCents: true },
      },
    },
  });
  const vat =
    order.vatShares === null
      ? vatOf(order.ttcByRate, "vatCents")
      : vatOf(order.vatShares, "amountCents");
  return {
    status,
    code: null,
    amounts: {
      vatMethod: order.vatMethod,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      discounts: order.discounts.map((discount) => discount.amountCents),
      voucherCents: order.voucherDiscountCents,
      deliveryFeeCents: order.deliveryFeeCents,
      lateFeeCents: order.lateFeeCents,
      vat,
      vatCents: order.vatCents,
      totalCents: order.totalCents,
      lines: bySku(order.lines),
    },
    notes,
  };
}

/** L'identifiant d'une commande créée, lu sur la réponse. */
export function createdIdOf(response: request.Response): string | null {
  return response.status === 201 || response.status === 200
    ? str(asObject(response.body)["id"])
    : null;
}
