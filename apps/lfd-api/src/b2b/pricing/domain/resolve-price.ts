import {
  addCents,
  compareExact,
  fractionByBasisPoints,
  fromCents,
  roundToCents,
  scaleByBasisPoints,
  type Exact,
} from "@lfd/money";
import { PRICE_STAGES, type PriceFloor, type PriceRule, type PriceStep } from "./price-rule.js";
import type { PricingContext, ResolvedPrice } from "./price-rule.js";
import { InvalidAlterationError, InvalidCanonicalPriceError } from "./pricing-errors.js";
import { applies, winnerOf } from "./specificity.js";

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
 * Une quatrième s'y est ajoutée le 2026-08-18 : **la mercuriale scelle**. Un
 * prix négocié posé à l'étage mercuriale rend les étages suivants transparents,
 * sauf pour une règle qui porte `stacksOverMercuriale`. Auparavant la chaîne
 * composait jusqu'au bout, si bien qu'un compte au tarif négocié empochait AUSSI
 * la promotion publique — un cumul que personne n'avait décidé, qui ne se lisait
 * nulle part, et qui ne se découvrait qu'en comparant deux factures.
 *
 * @throws {InvalidCanonicalPriceError} prix canonique nul ou négatif.
 * @throws {InvalidAlterationError} grandeur d'altération non strictement positive.
 * @throws {AmbiguousPriceRulesError} deux règles également spécifiques dans un étage.
 */
export function resolvePrice(
  canonicalMillicents: number,
  rules: readonly PriceRule[],
  context: PricingContext,
  floor: PriceFloor | null = null,
): ResolvedPrice {
  // Zéro est **accepté** : un article offert (échantillon, geste commercial
  // catalogué) est un cas réel, et le contrat de fil le permet déjà
  // (`nonnegative`). Seul le négatif est refusé — il n'a aucune lecture. La
  // première écriture refusait aussi zéro, par réflexe de rigueur : elle
  // cassait un chemin existant, celui d'une commande sans rien à encaisser.
  if (!Number.isInteger(canonicalMillicents) || canonicalMillicents < 0) {
    throw new InvalidCanonicalPriceError(canonicalMillicents);
  }

  const steps: PriceStep[] = [];
  const sealedRuleIds: string[] = [];
  let running = fromCents(canonicalMillicents);
  let sealedByRuleId: string | null = null;

  for (const stage of PRICE_STAGES) {
    // Le gagnant de l'étage se désigne D'ABORD, le SCELLEMENT décide ENSUITE
    // s'il agit. L'ordre compte : écarter les règles scellées avant l'arbitrage
    // laisserait une règle moins spécifique gagner un étage qu'elle avait
    // perdu, donc appliquerait une décision que l'éviction avait écartée.
    //
    // Les conditions d'application, elles, se filtrent ICI — `winnerOf` les
    // refiltre, sans effet. Le détour vaut la seule chose qu'il rend : à cet
    // instant, les PERDANTS de l'étage existent encore. Un cran plus loin il ne
    // reste que le gagnant, et dire quelle règle il a évincée demanderait de
    // refaire l'arbitrage ailleurs — ce que l'écran de tarification faisait, au
    // risque que les deux réponses divergent.
    const applicable = rules.filter((rule) => rule.stage === stage && applies(rule, context));
    const winner = winnerOf(applicable, context);
    if (winner === null) {
      continue; // Étage transparent : il laisse passer le prix entrant.
    }
    if (sealedByRuleId !== null && !winner.stacksOverMercuriale) {
      // Scellé : la règle est écartée, et le fait est CONSIGNÉ plutôt qu'avalé.
      sealedRuleIds.push(winner.id);
      continue;
    }
    running = apply(running, winner);
    steps.push({
      stage,
      ruleId: winner.id,
      label: winner.label,
      scope: winner.scope,
      // Arrondi pour l'AFFICHAGE seulement : `running` reste exact et poursuit
      // la chaîne. Reprendre cette valeur arrondie serait l'arrondi par étage
      // qu'on cherche justement à éviter.
      resultMillicents: roundToCents(running),
      supersedes: applicable
        .filter((rule) => rule.id !== winner.id)
        .map((rule) => ({ ruleId: rule.id, label: rule.label })),
    });
    if (stage === "mercuriale") {
      sealedByRuleId = winner.id;
    }
  }

  const lowest = floorValue(floor, canonicalMillicents);
  const floored = lowest !== null && compareExact(running, lowest) < 0;
  const finalExact = floored && lowest !== null ? lowest : running;

  // **Zéro est le plancher de tout le système**, même sans limite posée.
  //
  // Une baisse en euros plus grande que le prix — « −5 € sur le catalogue »
  // appliqué à un croissant à 2 € — rendait −3,00 €. Ce cas-là ne peut pas se
  // refuser à la saisie : la règle est scopée, le canonique varie d'un article
  // à l'autre, et personne ne connaît le résultat avant de résoudre.
  //
  // Il ne se refuse pas non plus ICI par une exception : cette fonction est
  // celle qui facture, et lever ferait tomber le panier d'un client pour une
  // règle qu'il n'a pas écrite — ce qui est exactement ce qui se passait, en
  // pire, puisque le refus tombait plus loin, sur la ligne de commande, sans
  // que rien n'ait alerté sur l'écran de tarification.
  //
  // Le prix est donc ramené à zéro et le fait est CONSIGNÉ. Un article offert
  // est un cas réel du modèle (le canonique zéro est accepté) ; un article à
  // prix négatif n'en est pas un — ce serait un remboursement.
  const rounded = roundToCents(finalExact);
  const clampedToZero = rounded < 0;

  return {
    basePriceMillicents: canonicalMillicents,
    steps,
    floored,
    clampedToZero,
    sealedByRuleId,
    sealedRuleIds,
    finalMillicents: clampedToZero ? 0 : rounded,
  };
}

/** `replace` pose un prix ; `alter` modifie celui qui entre. */
function apply(running: Exact, rule: PriceRule): Exact {
  if (rule.nature === "replace") {
    return fromCents(rule.amountMillicents);
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
function floorValue(floor: PriceFloor | null, canonicalMillicents: number): Exact | null {
  if (floor === null) {
    return null;
  }
  return floor.mode === "amount"
    ? fromCents(floor.cents)
    : fractionByBasisPoints(fromCents(canonicalMillicents), floor.bp);
}
