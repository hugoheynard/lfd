/**
 * **La remise d'une promotion « dans le prix affiché », chiffrée sur la
 * facture** — plan `documentation/promotions/plan-remise-par-ligne.md`,
 * § 18.6, point 2 (CGI art. 242 nonies A : une réduction chiffrable et
 * directement liée à l'opération figure sur la facture).
 *
 * Elle n'est pas recalculée : elle se LIT dans la trace de prix figée sur la
 * ligne de commande (`order_lines.base_price_millicents`, `pricing_steps`,
 * `pricing_floored`, `pricing_clamped_to_zero`). Le prix brut est celui qui
 * entrait dans l'étage `promotion` ; le prix net est celui de la ligne.
 *
 * On se TAIT plutôt que d'inventer (rend `null`) quand la différence brut −
 * net ne serait pas celle de la promotion : un plancher qui a relevé le prix,
 * un prix ramené à zéro ou une trace d'avant la consignation (`null`), un
 * étage qui agit APRÈS la promotion (un geste), une trace dont le dernier
 * prix n'est pas celui de la ligne.
 */

/** Une étape de prix telle que la trace la fige — sans ses champs d'écran. */
export interface FrozenPriceStep {
  readonly stage: string;
  readonly label: string;
  readonly resultMillicents: number;
}

/** La trace figée, réduite à ce qu'il faut pour chiffrer la remise. */
export interface FrozenLinePricingTrace {
  readonly basePriceMillicents: number;
  readonly steps: readonly FrozenPriceStep[];
  readonly floored: boolean;
  /** `null` = trace d'avant le 2026-09-09 : on ne sait pas, donc on se tait. */
  readonly clampedToZero: boolean | null;
}

/** La remise d'une ligne : le prix avant la promotion, et ses noms (libellés client figés). */
export interface InvoicePriceDiscount {
  /** BT-148 — le prix unitaire HT brut, en millicentimes, avant la promotion. */
  readonly grossUnitPriceMillicents: number;
  /** Les promotions de l'étage, dans l'ordre d'application ; jamais vide. */
  readonly labels: readonly string[];
}

const PROMOTION_STAGE = "promotion";
/** Points de base dans 100 % (le pourcentage affiché garde deux décimales). */
const BASIS_POINTS = 10_000;

/** La remise lue dans la trace, ou `null` quand elle ne se chiffre pas honnêtement. */
export function promotionPriceDiscountOf(
  trace: FrozenLinePricingTrace | null,
  netUnitPriceMillicents: number,
): InvoicePriceDiscount | null {
  if (trace === null || trace.floored || trace.clampedToZero !== false) {
    return null;
  }
  const { steps } = trace;
  let first = steps.length;
  while (first > 0 && steps[first - 1]?.stage === PROMOTION_STAGE) {
    first -= 1;
  }
  const promotions = steps.slice(first);
  const last = promotions.at(-1);
  if (last === undefined || last.resultMillicents !== netUnitPriceMillicents) {
    return null;
  }
  const gross = first === 0 ? trace.basePriceMillicents : (steps[first - 1]?.resultMillicents ?? 0);
  if (gross <= netUnitPriceMillicents) {
    return null;
  }
  return { grossUnitPriceMillicents: gross, labels: [...new Set(promotions.map((s) => s.label))] };
}

/**
 * Le taux de la remise, en points de base arrondis (12 % = 1 200) : (brut −
 * net) ÷ brut. Dérivé à l'affichage, jamais figé — il ne sert qu'à le dire.
 */
export function priceDiscountBasisPoints(gross: number, net: number): number {
  return gross <= 0 ? 0 : Math.round(((gross - net) * BASIS_POINTS) / gross);
}

/** « 12 % », « 10,75 % » — deux décimales au plus, zéros de queue retirés. */
export function priceDiscountPercentLabel(gross: number, net: number): string {
  const basisPoints = priceDiscountBasisPoints(gross, net);
  const whole = Math.trunc(basisPoints / 100);
  const fraction = String(basisPoints % 100)
    .padStart(2, "0")
    .replace(/0+$/u, "");
  return `${String(whole)}${fraction === "" ? "" : `,${fraction}`} %`;
}

/** La clé d'une remise, pour qu'une ligne remisée ne se fonde pas dans une ligne qui ne l'est pas. */
export function priceDiscountKey(discount: InvoicePriceDiscount | undefined): string {
  return discount === undefined
    ? "-"
    : `${String(discount.grossUnitPriceMillicents)}:${discount.labels.join("\u001f")}`;
}

/** La phrase de la remise, commune au PDF et au Factur-X : « Remise 12 % : Promo printemps ». */
export function priceDiscountNote(net: number, discount: InvoicePriceDiscount): string {
  const percent = priceDiscountPercentLabel(discount.grossUnitPriceMillicents, net);
  return `Remise ${percent} : ${discount.labels.join(", ")}`;
}
