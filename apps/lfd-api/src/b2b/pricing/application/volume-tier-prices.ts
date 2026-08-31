import { resolvePrice } from "../domain/resolve-price.js";
import { ladderAsRule, tierFor } from "../domain/volume-ladder.js";
import { winnerOf } from "../domain/specificity.js";
import type { PriceFloor, PriceRule, PricingContext } from "../domain/price-rule.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";
import type { VolumeTierPriceView } from "@lfd/contracts";

/**
 * **Ce que le barème donne, palier par palier**, sur un article.
 *
 * C'est la grille que le commercial lit au téléphone — « à combien je lui fais
 * les 100 ? ». Elle ne peut se calculer qu'ici : il faut le prix canonique de
 * l'article, et surtout **la fonction qui facture**, parce qu'un palier ne joue
 * pas seul. Une promotion en cours compose avec lui, un plancher peut le
 * relever, et un prix affiché « canonique × (1 − remise) » mentirait dès qu'un
 * autre étage existe.
 *
 * Chaque ligne est donc une **résolution complète** à la quantité du palier —
 * la même que si le client passait cette commande-là.
 */
export function volumeTierPrices(
  canonicalMillicents: number,
  ladders: readonly VolumeLadder[],
  rules: readonly PriceRule[],
  context: PricingContext,
  floor: PriceFloor | null,
): readonly VolumeTierPriceView[] | null {
  const ladder = winningLadder(ladders, context);
  if (ladder === null) {
    return null;
  }

  return ladder.tiers.map((tier) => {
    const at = atQuantity(context, tier.minQuantity);
    const resolved = resolvePrice(canonicalMillicents, withLadder(rules, ladders, at), at, floor);
    return {
      minQuantity: tier.minQuantity,
      unitPriceMillicents: resolved.finalMillicents,
      discountBp: discountBpOf(canonicalMillicents, resolved.finalMillicents),
    };
  });
}

/**
 * Le barème qui **vise** cet article, arbitré par la même spécificité que les
 * règles — un barème de produit l'emporte sur celui de sa famille.
 *
 * L'arbitrage passe par `winnerOf` plutôt que par une comparaison maison : deux
 * échelles de spécificité pour la même notion finiraient par diverger d'un cran.
 * Le barème est converti à une quantité assez haute pour qu'au moins un palier
 * réponde — sinon un barème qui ne s'ouvre qu'à 50 pièces serait jugé absent.
 */
function winningLadder(
  ladders: readonly VolumeLadder[],
  context: PricingContext,
): VolumeLadder | null {
  const reach = Math.max(...ladders.flatMap((ladder) => ladder.tiers.map((t) => t.minQuantity)), 1);
  const probe = atQuantity(context, reach);
  const asRules = ladders
    .map((ladder) => ladderAsRule(ladder, probe))
    .filter((rule): rule is PriceRule => rule !== null);
  const winner = winnerOf(asRules, probe);
  return winner === null ? null : (ladders.find((ladder) => ladder.id === winner.id) ?? null);
}

/**
 * Le contexte **déplacé à une quantité**, sur la mesure qui compte.
 *
 * Sous engagement, un palier se lit « quand le CUMUL atteint N », pas « quand la
 * commande fait N » : la grille doit donc bouger le cumul, sans quoi elle
 * annoncerait des paliers hors d'atteinte à un client qui les a déjà franchis.
 * Sans engagement, les deux mesures sont la même et rien ne change.
 */
function atQuantity(context: PricingContext, quantity: number): PricingContext {
  return {
    ...context,
    quantity,
    cumulativeQuantity: context.cumulativeQuantity === null ? null : quantity,
  };
}

/** Les règles du moment, plus le palier que les barèmes ouvrent à cette quantité. */
function withLadder(
  rules: readonly PriceRule[],
  ladders: readonly VolumeLadder[],
  context: PricingContext,
): PriceRule[] {
  const fromLadders = ladders
    .map((ladder) =>
      tierFor(ladder, context.quantity) === null ? null : ladderAsRule(ladder, context),
    )
    .filter((rule): rule is PriceRule => rule !== null);
  return [...rules, ...fromLadders];
}

/** L'écart au tarif d'entrée, en points de base d'une baisse. Jamais négatif. */
function discountBpOf(canonicalMillicents: number, finalMillicents: number): number {
  if (canonicalMillicents <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.round(((canonicalMillicents - finalMillicents) / canonicalMillicents) * 10_000),
  );
}
