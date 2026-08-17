import {
  addCents,
  compareExact,
  fractionByBasisPoints,
  fromCents,
  roundToCents,
  scaleByBasisPoints,
  type Exact,
} from "./exact-money.js";
import { PRICE_STAGES, type PriceFloor, type PriceRule, type PriceStep } from "./price-rule.js";
import type { PricingContext, ResolvedPrice } from "./price-rule.js";
import { InvalidAlterationError, InvalidCanonicalPriceError } from "./pricing-errors.js";
import { winnerOf } from "./specificity.js";

/**
 * **La résolution de prix** — la fonction que tout le reste emballe.
 *
 * Pure : elle prend un prix canonique, des règles et un contexte, elle rend un
 * prix et sa trace. Aucune base, aucune horloge (l'instant est **dans** le
 * contexte), aucun réseau. C'est ce qui permet de l'éprouver en énumérant les
 * cas plutôt qu'en fabriquant un environnement — et c'est la seule pièce de tout
 * ce chantier dont la valeur ne dépend pas du transport.
 *
 * Trois décisions du 2026-08-17 y vivent :
 *
 * - **composition**, pas addition : chaque étage s'applique au prix sortant du
 *   précédent, donc −20 % puis −10 % font −28 % ;
 * - **un seul arrondi**, en fin de chaîne, la chaîne travaillant en rationnel ;
 * - **un plancher à deux formes**, fraction du canonique ou montant, dont le
 *   déclenchement est consigné plutôt qu'avalé.
 *
 * @throws {InvalidCanonicalPriceError} prix canonique nul ou négatif.
 * @throws {InvalidAlterationError} grandeur d'altération non strictement positive.
 * @throws {AmbiguousPriceRulesError} deux règles également spécifiques dans un étage.
 */
export function resolvePrice(
  canonicalCents: number,
  rules: readonly PriceRule[],
  context: PricingContext,
  floor: PriceFloor | null = null,
): ResolvedPrice {
  // Zéro est **accepté** : un article offert (échantillon, geste commercial
  // catalogué) est un cas réel, et le contrat de fil le permet déjà
  // (`nonnegative`). Seul le négatif est refusé — il n'a aucune lecture. La
  // première écriture refusait aussi zéro, par réflexe de rigueur : elle
  // cassait un chemin existant, celui d'une commande sans rien à encaisser.
  if (!Number.isInteger(canonicalCents) || canonicalCents < 0) {
    throw new InvalidCanonicalPriceError(canonicalCents);
  }

  const steps: PriceStep[] = [];
  let running = fromCents(canonicalCents);

  for (const stage of PRICE_STAGES) {
    const winner = winnerOf(
      rules.filter((rule) => rule.stage === stage),
      context,
    );
    if (winner === null) {
      continue; // Étage transparent : il laisse passer le prix entrant.
    }
    running = apply(running, winner);
    steps.push({
      stage,
      ruleId: winner.id,
      label: winner.label,
      // Arrondi pour l'AFFICHAGE seulement : `running` reste exact et poursuit
      // la chaîne. Reprendre cette valeur arrondie serait l'arrondi par étage
      // qu'on cherche justement à éviter.
      resultCents: roundToCents(running),
    });
  }

  const lowest = floorValue(floor, canonicalCents);
  const floored = lowest !== null && compareExact(running, lowest) < 0;
  const finalExact = floored && lowest !== null ? lowest : running;

  return {
    basePriceCents: canonicalCents,
    steps,
    floored,
    finalCents: roundToCents(finalExact),
  };
}

/** `replace` pose un prix ; `alter` modifie celui qui entre. */
function apply(running: Exact, rule: PriceRule): Exact {
  if (rule.nature === "replace") {
    return fromCents(rule.amountCents);
  }

  const { alteration } = rule;
  const direction = alteration.direction === "increase" ? 1 : -1;
  const magnitude = alteration.mode === "percent" ? alteration.bp : alteration.cents;
  if (!Number.isInteger(magnitude) || magnitude <= 0) {
    throw new InvalidAlterationError(magnitude);
  }

  return alteration.mode === "percent"
    ? scaleByBasisPoints(running, alteration.bp, direction)
    : addCents(running, alteration.cents, direction);
}

/**
 * Le plancher, ramené à une valeur exacte.
 *
 * La fraction se calcule **sur le canonique**, pas sur le prix courant : un
 * plancher qui suivrait le prix altéré descendrait avec lui, et ne planchérait
 * rien du tout.
 */
function floorValue(floor: PriceFloor | null, canonicalCents: number): Exact | null {
  if (floor === null) {
    return null;
  }
  return floor.mode === "amount"
    ? fromCents(floor.cents)
    : fractionByBasisPoints(fromCents(canonicalCents), floor.bp);
}
