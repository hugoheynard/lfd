/**
 * De l'argent **exact**, le temps d'une résolution.
 *
 * Le doc pose « arrondir une seule fois, en fin de chaîne » : un arrondi par
 * étage accumule l'erreur, et à quatre étages on décale d'un centime — ce qui se
 * voit sur une facture. Il faut donc traverser la chaîne sans arrondir, donc
 * porter une valeur qui n'est pas un entier de centimes.
 *
 * D'où un **rationnel**, et un rationnel en `bigint` plutôt qu'en `number`.
 * Trois pourcentages composés donnent un dénominateur de 10¹², et un article à
 * 1 000 € porterait alors un numérateur de 10¹⁷ — au-delà de `Number.MAX_SAFE_INTEGER`
 * (≈ 9 × 10¹⁵). Le calcul deviendrait faux **exactement** sur les articles chers,
 * c'est-à-dire là où l'erreur coûte le plus. `bigint` supprime la question au
 * lieu de la borner.
 *
 * Ce module ne connaît ni règle, ni étage : il additionne et multiplie.
 */

export interface Exact {
  readonly num: bigint;
  readonly den: bigint;
}

/** Un montant en centimes, exact. */
export function fromCents(cents: number): Exact {
  return { num: BigInt(Math.trunc(cents)), den: 1n };
}

/** Réduit la fraction — sans ça les dénominateurs se multiplient sans jamais retomber. */
function reduce(value: Exact): Exact {
  const divisor = gcd(abs(value.num), value.den);
  return divisor <= 1n ? value : { num: value.num / divisor, den: value.den / divisor };
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

/** Multiplie par une fraction (`bp` points de base d'une hausse ou d'une baisse). */
export function scaleByBasisPoints(value: Exact, bp: number, direction: 1 | -1): Exact {
  const factor = 10_000n + BigInt(direction) * BigInt(Math.trunc(bp));
  return reduce({ num: value.num * factor, den: value.den * 10_000n });
}

/**
 * Une **fraction** de la valeur, en points de base : `bp = 5000` rend la moitié.
 *
 * Distinct de {@link scaleByBasisPoints}, qui *altère* de `bp` (« −5 % »). Ici on
 * prend `bp` de la valeur (« 50 % de »). Les deux s'écrivent avec les mêmes
 * chiffres et ne veulent pas dire la même chose — d'où deux noms.
 */
export function fractionByBasisPoints(value: Exact, bp: number): Exact {
  return reduce({ num: value.num * BigInt(Math.trunc(bp)), den: value.den * 10_000n });
}

/** Ajoute (ou retranche) un montant en centimes. */
export function addCents(value: Exact, cents: number, direction: 1 | -1): Exact {
  const delta = BigInt(direction) * BigInt(Math.trunc(cents)) * value.den;
  return reduce({ num: value.num + delta, den: value.den });
}

/** Compare deux valeurs exactes. Négatif si `left < right`. */
export function compareExact(left: Exact, right: Exact): number {
  const delta = left.num * right.den - right.num * left.den;
  return delta === 0n ? 0 : delta < 0n ? -1 : 1;
}

/**
 * L'unique arrondi de la chaîne, **au centime le plus proche**, la moitié
 * s'éloignant de zéro.
 *
 * C'est l'arrondi commercial usuel : 2,345 € donne 2,35 €. L'arrondi « au pair »
 * de la norme IEEE rendrait 2,34 € une fois sur deux, ce qui est correct
 * statistiquement et indéfendable devant un client qui recompte.
 */
export function roundToCents(value: Exact): number {
  const negative = value.num < 0n;
  const numerator = abs(value.num);
  const quotient = numerator / value.den;
  const twiceRemainder = (numerator % value.den) * 2n;
  const rounded = twiceRemainder >= value.den ? quotient + 1n : quotient;
  return Number(negative ? -rounded : rounded);
}
