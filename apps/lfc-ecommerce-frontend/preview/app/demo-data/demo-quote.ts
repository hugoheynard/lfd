import type { MyShopQuoteView, ShopQuoteView } from '@lfd/contracts';

import { DEMO_CATALOGUE, DEMO_VAT_RATE_PERCENT } from './demo-catalogue';
import { DEMO_DELIVERY_ZONES, DEMO_PICKUP_ADDRESSES } from './demo-places';

/**
 * **Le décompte de l'aperçu** — ce que `POST /shop/quote` rendrait pour le
 * catalogue de démonstration.
 *
 * ⚠️ Ce n'est PAS la règle de prix : un seul taux, une remise de retrait en
 * pourcentage, des frais de zone forfaitaires, un arrondi par taux. Il suffit
 * que les nombres soient plausibles et cohérents entre eux, pour que les
 * phrases du panier aient de quoi s'afficher — l'aperçu montre des textes,
 * il ne chiffre rien.
 */

interface QuoteRequest {
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  readonly fulfillment:
    | { readonly method: 'pickup'; readonly pickupAddressId: string | null }
    | { readonly method: 'delivery'; readonly codePostal: string }
    | null;
}

const BASIS_POINTS = 10_000;
const MILLICENTS_PER_CENT = 1000;
/** Les points d'un euro dépensé, pour la phrase « vous gagnerez… ». */
const POINTS_PER_EURO = 1;

/** Lit le corps de la requête : rien de ce qui ne ressemble pas à un devis n'est chiffré. */
export function readQuoteRequest(body: unknown): QuoteRequest | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('lines' in body) ||
    !Array.isArray(body.lines)
  ) {
    return null;
  }
  const lines = body.lines.flatMap((line: unknown) =>
    typeof line === 'object' &&
    line !== null &&
    'sku' in line &&
    typeof line.sku === 'string' &&
    'quantity' in line &&
    typeof line.quantity === 'number'
      ? [{ sku: line.sku, quantity: line.quantity }]
      : [],
  );
  const raw = 'fulfillment' in body ? body.fulfillment : null;
  return { lines, fulfillment: readFulfillment(raw) };
}

function readFulfillment(raw: unknown): QuoteRequest['fulfillment'] {
  if (typeof raw !== 'object' || raw === null || !('method' in raw)) {
    return null;
  }
  if (raw.method === 'delivery' && 'codePostal' in raw && typeof raw.codePostal === 'string') {
    return { method: 'delivery', codePostal: raw.codePostal };
  }
  if (raw.method === 'pickup') {
    const id =
      'pickupAddressId' in raw && typeof raw.pickupAddressId === 'string'
        ? raw.pickupAddressId
        : null;
    return { method: 'pickup', pickupAddressId: id };
  }
  return null;
}

/** Le devis d'un visiteur. */
export function demoQuote(request: QuoteRequest): ShopQuoteView {
  const lines = request.lines.flatMap((line) => {
    const item = DEMO_CATALOGUE.items.find((candidate) => candidate.sku === line.sku);
    if (item === undefined) {
      return [];
    }
    const lineTotalCents = Math.round(
      (item.unitPriceMillicents * line.quantity) / MILLICENTS_PER_CENT,
    );
    return [
      {
        sku: item.sku,
        quantity: line.quantity,
        // La démo ne vend qu'à la pièce.
        saleUnit: 'piece' as const,
        unitPriceMillicents: item.unitPriceMillicents,
        lineTotalCents,
        lineTotalTtcCents: Math.round(lineTotalCents * (1 + DEMO_VAT_RATE_PERCENT / 100)),
        vatRatePercent: DEMO_VAT_RATE_PERCENT,
      },
    ];
  });
  const subtotalHtCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const discountAdjustment = pickupDiscountOf(request.fulfillment);
  const discountCents =
    discountAdjustment === null
      ? 0
      : Math.round((subtotalHtCents * discountAdjustment.bp) / BASIS_POINTS);
  const deliveryFeeCents = deliveryFeeOf(request.fulfillment);
  const base = subtotalHtCents - discountCents + deliveryFeeCents;
  const vatCents = Math.round((base * DEMO_VAT_RATE_PERCENT) / 100);
  return {
    lines,
    subtotalHtCents,
    discountCents,
    discountAdjustment,
    voucherDiscountCents: 0,
    deliveryFeeCents,
    deliveryVatMode: 'follows_goods',
    vat: lines.length === 0 ? [] : [{ rate: DEMO_VAT_RATE_PERCENT, amountCents: vatCents }],
    totalCents: base + vatCents,
  };
}

/** Le devis d'une personne reconnue : le même, avec les points qu'il rapporterait. */
export function demoMyQuote(request: QuoteRequest, loyaltyOpen: boolean): MyShopQuoteView {
  const quote = demoQuote(request);
  return {
    ...quote,
    loyaltyPointsToEarn: loyaltyOpen
      ? Math.floor((quote.totalCents / 100) * POINTS_PER_EURO)
      : null,
    voucherTotalEffectCents: 0,
  };
}

function pickupDiscountOf(
  fulfillment: QuoteRequest['fulfillment'],
): { readonly mode: 'percent'; readonly bp: number } | null {
  if (fulfillment?.method !== 'pickup') {
    return null;
  }
  // Sans point choisi, la caisse retient le seul point ouvert, ou refuse
  // (plus de point par défaut, 2026-10-15) : la démo, qui en a deux, n'en retient aucun.
  const point = DEMO_PICKUP_ADDRESSES.find(
    (candidate) => candidate.id === fulfillment.pickupAddressId,
  );
  const discount = point?.discounts.b2c?.adjustment ?? null;
  return discount?.mode === 'percent' ? discount : null;
}

function deliveryFeeOf(fulfillment: QuoteRequest['fulfillment']): number {
  if (fulfillment?.method !== 'delivery') {
    return 0;
  }
  const zone = DEMO_DELIVERY_ZONES.find((candidate) =>
    candidate.postalPrefixes.some((prefix) => fulfillment.codePostal.startsWith(prefix)),
  );
  return zone?.fee.mode === 'amount' ? zone.fee.cents : 0;
}
