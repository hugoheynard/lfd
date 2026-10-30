import { fractionByBasisPoints, roundToCents, type Exact } from "./exact.js";
import { splitCents } from "./order-vat-split.js";
import { taxMultiplierBp, ttcOfHtAmount } from "./ttc-of-ht-amount.js";

/**
 * **Plusieurs remises de panier, appliquées l'une après l'autre** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 16.1 (point PANIER, étapes 3 et 4) et § 18.4.
 *
 * Chaque ligne garde un **reste exact** (rationnel), initialisé à son
 * montant : HT au chemin `line_ht`, TTC au chemin `exact_ht`. Une étape :
 *
 * 1. son assiette est la somme des restes des lignes qu'elle couvre ;
 * 2. son montant s'arrondit **une fois** — pourcentage au plus proche, la
 *    moitié vers le haut ; montant fixe tel quel (`line_ht`) ou converti par
 *    `ttcOfHtAmount` (`exact_ht`) — puis se borne à l'assiette (au centime
 *    inférieur : un reste ne devient jamais négatif) ;
 * 3. il se ventile par taux par `splitCents`, sur les restes de ses lignes
 *    groupés par taux — sur leurs poids CONVERTIS `w × (1 + t)` pour un
 *    montant fixe au chemin `exact_ht`, comme `pickupDiscountParts` le faisait
 *    pour la remise unique ;
 * 4. chaque reste couvert est réduit au prorata du montant appliqué :
 *    `reste × (1 − montant / assiette)`, en exact.
 *
 * 🔴 **Une seule remise = la remise d'aujourd'hui, au centime.** L'étape 1
 * part des montants entiers des lignes : son assiette est l'assiette éligible
 * d'hier, son montant `percentOf` / `discountCentsOf` d'hier, sa ventilation
 * `splitCents` sur les mêmes poids (`splitCents` et `ttcOfHtAmount` ne
 * dépendent que des proportions, le dénominateur commun n'y change rien). Les
 * suites `basket-discounts*.spec.ts` le tiennent contre la formule d'hier.
 *
 * L'ordre est celui de la liste : il est décidé par l'appelant (§ 18.4 :
 * non cumulables puis cumulables, chacune par rang puis id) et figé en `rank`.
 * Ce module ne trie rien et ne plafonne rien — le plafond est une règle de la
 * commande, tenue par son domaine.
 */

/** Une remise telle que saisie : pourcentage en points de base, ou montant fixe HT. */
export type BasketDiscountAdjustment =
  | { readonly mode: "percent"; readonly bp: number }
  | { readonly mode: "amount"; readonly cents: number };

/** Une remise de panier et les lignes qu'elle couvre (indices dans la liste des lignes). */
export interface BasketDiscount {
  readonly adjustment: BasketDiscountAdjustment;
  readonly coveredLines: readonly number[];
}

/** Une ligne vue par la chaîne : son montant entier (HT ou TTC selon le chemin) et son taux. */
export interface BasketDiscountLine {
  readonly amountCents: number;
  readonly vatRate: number;
}

/**
 * Le chemin de la commande : `line_ht` (pro, montants HT, fixe tel quel) ou
 * `exact_ht` (particulier, montants TTC, fixe converti).
 */
export type BasketDiscountPath = "line_ht" | "exact_ht";

/** Une étape appliquée — positive, comme les colonnes de remise. */
export interface BasketDiscountStep {
  /** À partir de 1, l'ordre d'application. */
  readonly rank: number;
  /** L'assiette de l'étape, exacte : la somme des restes de ses lignes. */
  readonly base: Exact;
  /** Le montant appliqué, en centimes — HT en `line_ht`, TTC en `exact_ht`. */
  readonly amountCents: number;
  /** Sa ventilation par taux ; Σ = `amountCents`. Vide si rien n'est appliqué. */
  readonly parts: ReadonlyMap<number, number>;
}

/** Les étapes, dans l'ordre, et le reste exact de chaque ligne après la dernière. */
export interface BasketDiscountChain {
  readonly steps: readonly BasketDiscountStep[];
  readonly remainders: readonly Exact[];
}

/**
 * Applique `discounts` dans l'ordre de la liste.
 *
 * @throws {RangeError} si une remise couvre un indice de ligne inexistant —
 *   une couverture fausse remiserait une ligne que personne n'a désignée.
 */
export function chainBasketDiscounts(
  lines: readonly BasketDiscountLine[],
  discounts: readonly BasketDiscount[],
  path: BasketDiscountPath,
): BasketDiscountChain {
  let nums = lines.map((line) => BigInt(Math.trunc(line.amountCents)));
  let den = 1n;
  const steps: BasketDiscountStep[] = [];
  discounts.forEach((discount, index) => {
    const covered = coveredSet(discount, lines.length);
    const weights = weightsByRate(lines, nums, covered);
    const base = sumOf(weights);
    const amountCents =
      base > 0n ? stepAmount(discount.adjustment, { num: base, den }, weights, path) : 0;
    const parts =
      amountCents > 0
        ? splitCents(amountCents, splitWeights(discount, weights, path))
        : new Map<number, number>();
    steps.push({ rank: index + 1, base: { num: base, den }, amountCents, parts });
    if (amountCents > 0) {
      const kept = base - BigInt(amountCents) * den;
      nums = nums.map((num, i) => (covered.has(i) ? num * kept : num * base));
      den *= base;
    }
  });
  return { steps, remainders: nums.map((num) => ({ num, den })) };
}

function coveredSet(discount: BasketDiscount, lineCount: number): ReadonlySet<number> {
  for (const index of discount.coveredLines) {
    if (!Number.isInteger(index) || index < 0 || index >= lineCount) {
      throw new RangeError(`Remise de panier sur une ligne inexistante (indice ${index}).`);
    }
  }
  return new Set(discount.coveredLines);
}

function weightsByRate(
  lines: readonly BasketDiscountLine[],
  nums: readonly bigint[],
  covered: ReadonlySet<number>,
): Map<number, bigint> {
  const byRate = new Map<number, bigint>();
  lines.forEach((line, i) => {
    if (covered.has(i)) {
      byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0n) + (nums[i] ?? 0n));
    }
  });
  return byRate;
}

function stepAmount(
  adjustment: BasketDiscountAdjustment,
  base: Exact,
  weights: ReadonlyMap<number, bigint>,
  path: BasketDiscountPath,
): number {
  const available = Number(base.num / base.den);
  const raw =
    adjustment.mode === "percent"
      ? roundToCents(fractionByBasisPoints(base, adjustment.bp))
      : path === "exact_ht"
        ? ttcOfHtAmount(adjustment.cents, weights)
        : adjustment.cents;
  return Math.min(Math.max(0, Math.trunc(raw)), Math.max(0, available));
}

function splitWeights(
  discount: BasketDiscount,
  weights: ReadonlyMap<number, bigint>,
  path: BasketDiscountPath,
): ReadonlyMap<number, bigint> {
  if (discount.adjustment.mode === "percent" || path === "line_ht") {
    return weights;
  }
  return new Map([...weights].map(([rate, w]) => [rate, w * taxMultiplierBp(rate)]));
}

function sumOf(weights: ReadonlyMap<number, bigint>): bigint {
  let total = 0n;
  for (const weight of weights.values()) {
    total += weight;
  }
  return total;
}
