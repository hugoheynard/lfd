import { splitCents, type RatedCents, type VatLine } from "@lfd/money";

import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/**
 * **Les remises de panier d'un bon, une par une, sur ses taux** — `documentation/promotions/promotions.md`, § 2.11, lot M5.
 *
 * Un bon d'au plus une remise se découpe comme avant M5 (`splitOrderByRate`,
 * sur le total de sa remise) : c'est ce qui rend la facture d'une seule
 * remise identique à celle d'hier, au caractère près. Ce module ne sert qu'au
 * bon qui en porte plusieurs, et ne recalcule rien : il reprend les parts
 * FIGÉES de chaque remise (`delivery_note_discounts`, sinon
 * `order_discounts.vat_shares`) — la composition a déjà arrondi chaque étape.
 *
 * Il refuse de les reprendre (`null`, le bon retombe alors sur le découpage
 * d'avant, sous la clé de la remise client) dès qu'elles ne tombent pas
 * juste : une part non figée, une somme qui n'est pas la remise du bon, un
 * taux qui recevrait plus de remise qu'il n'a de marchandise. Le montant
 * facturé reste celui du bon dans tous les cas ; seul le détail par
 * promotion se perd, et une facture juste vaut mieux qu'un détail faux.
 */

/** Une remise de panier découpée par taux, prête à être additionnée par clé. */
export interface InvoiceBasketDiscountSplit {
  readonly promotionId: string | null;
  readonly label: string | null;
  readonly byRate: readonly RatedCents[];
}

/** Ce que les remises chaînées laissent au bon de fidélité. */
export interface ChainedBasketDiscounts {
  readonly discounts: readonly InvoiceBasketDiscountSplit[];
  /** Σ des parts par remise, par taux — ce que la remise de retrait était seule. */
  readonly eligibleDiscount: readonly RatedCents[];
  readonly voucher: readonly RatedCents[];
}

/** Au moins deux remises pour qu'il y ait une chaîne à reprendre. */
const MINIMUM_CHAINED = 2;

/**
 * Les remises figées d'un bon qui en porte plusieurs, et le bon de fidélité
 * découpé sur ce qu'elles laissent — ou `null` : découper comme avant M5.
 */
export function chainedBasketDiscountsOf(
  order: FrozenInvoiceOrder,
  lines: readonly VatLine[],
): ChainedBasketDiscounts | null {
  const outcome = chainOf(order, lines);
  return "gap" in outcome ? null : outcome.chained;
}

/**
 * Pourquoi un bon à plusieurs remises retombe sur le découpage d'avant M5 —
 * ou `null` quand il n'y retombe pas (au plus une remise, ou parts justes).
 * Pur : c'est l'appelant qui journalise, jamais le domaine (un écart ne
 * s'avale pas en silence, consigne du 2026-10-31).
 */
export function unchainedBasketDiscountsGap(
  order: FrozenInvoiceOrder,
  lines: readonly VatLine[],
): string | null {
  if ((order.basketDiscounts ?? []).length < MINIMUM_CHAINED) {
    return null;
  }
  const outcome = chainOf(order, lines);
  return "gap" in outcome ? outcome.gap : null;
}

type ChainOutcome = { readonly chained: ChainedBasketDiscounts } | { readonly gap: string };

function chainOf(order: FrozenInvoiceOrder, lines: readonly VatLine[]): ChainOutcome {
  const discounts = frozenSplitsOf(order);
  if (discounts === null) {
    return { gap: "parts non figées (commande non reprise, ou parts illisibles)" };
  }
  const gross = byRate(lines.map((line) => ({ vatRate: line.vatRate, amountCents: line.htCents })));
  const eligible = byRate(discounts.flatMap((discount) => discount.byRate));
  const overflow = [...eligible].find(
    ([rate, cents]) => cents < 0 || cents > (gross.get(rate) ?? 0),
  );
  if (overflow !== undefined) {
    return {
      gap: `parts de ${String(overflow[1])} c au taux ${String(overflow[0])} % hors de la marchandise`,
    };
  }
  const total = sum([...eligible.values()]);
  if (total !== order.discountCents) {
    return {
      gap: `parts de ${String(total)} c pour une remise de ${String(order.discountCents)} c`,
    };
  }
  const net = new Map<number, bigint>();
  for (const [rate, cents] of gross) {
    net.set(rate, BigInt(cents - (eligible.get(rate) ?? 0)));
  }
  const available = sum([...net.values()].map(Number));
  const voucherCents = Math.min(Math.max(0, order.voucherDiscountCents), Math.max(0, available));
  return {
    chained: {
      discounts,
      eligibleDiscount: toRated(eligible),
      voucher: toRated(splitCents(voucherCents, net)),
    },
  };
}

function frozenSplitsOf(order: FrozenInvoiceOrder): readonly InvoiceBasketDiscountSplit[] | null {
  const frozen = order.basketDiscounts ?? [];
  if (frozen.length < MINIMUM_CHAINED) {
    return null;
  }
  const splits: InvoiceBasketDiscountSplit[] = [];
  for (const discount of frozen) {
    if (discount.parts === null) {
      return null;
    }
    splits.push({
      promotionId: discount.promotionId,
      label: discount.label,
      byRate: toRated(
        byRate(
          discount.parts.map((part) => ({ vatRate: part.rate, amountCents: part.amountCents })),
        ),
      ),
    });
  }
  return splits;
}

function byRate(parts: readonly RatedCents[]): Map<number, number> {
  const rated = new Map<number, number>();
  for (const part of parts) {
    rated.set(part.vatRate, (rated.get(part.vatRate) ?? 0) + Math.trunc(part.amountCents));
  }
  return rated;
}

/** Du plus bas taux au plus haut, sans part nulle — la forme de `splitOrderByRate`. */
function toRated(parts: ReadonlyMap<number, number>): readonly RatedCents[] {
  return [...parts.entries()]
    .filter(([, amountCents]) => amountCents !== 0)
    .sort(([left], [right]) => left - right)
    .map(([vatRate, amountCents]) => ({ vatRate, amountCents }));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
