import type {
  NegotiationRoom,
  PriceFloorView,
  PriceRuleView,
  PricingItemView,
} from "@lfd/contracts";

import { decideFloor } from "../domain/floor-policy.js";
import { floorCentsFor, resolveScopedFloor } from "../domain/resolve-floor.js";
import { resolvePrice } from "../domain/resolve-price.js";
import { applies, winnerOf } from "../domain/specificity.js";
import { volumeTierPrices } from "./volume-tier-prices.js";
import {
  PRICE_STAGES,
  type PriceRule,
  type PriceScope,
  type PriceStage,
  type PricingContext,
  type ScopedPriceFloor,
} from "../domain/price-rule.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

/** Une règle lue une fois, sous ses deux formes : celle qui calcule, celle qui s'affiche. */
export interface LoadedRule {
  readonly rule: PriceRule;
  readonly view: PriceRuleView;
}

export interface LoadedFloor {
  readonly floor: ScopedPriceFloor;
  readonly view: PriceFloorView;
}

/**
 * **Ce qui ne dépend pas de l'article, calculé une seule fois par lecture.**
 *
 * Chaque nœud de l'écran a besoin des mêmes trois choses : la liste nue des
 * règles, celle des planchers, et les règles rangées par étage. Les reconstruire
 * article par article coûtait, sur quatre-vingt-douze articles, quatre-vingt-
 * douze copies de chacune — pour un contenu strictement identique à chaque fois.
 *
 * Ce n'est pas une micro-optimisation de confort : le coût suit le **produit**
 * articles × règles, et c'est le catalogue comme le nombre de décisions qui
 * grandissent. Le jour où le PIM en pousse quelques milliers, la différence
 * n'est plus mesurée en millisecondes.
 */
export interface BoardMaterials {
  readonly rules: readonly PriceRule[];
  readonly floors: readonly ScopedPriceFloor[];
  /** Les règles par étage — l'axe sur lequel l'éviction se joue. */
  readonly byStage: ReadonlyMap<PriceStage, readonly PriceRule[]>;
}

export function boardMaterials(
  loadedRules: readonly LoadedRule[],
  loadedFloors: readonly LoadedFloor[],
): BoardMaterials {
  const rules = loadedRules.map((entry) => entry.rule);
  const byStage = new Map<PriceStage, readonly PriceRule[]>(
    PRICE_STAGES.map((stage) => [stage, rules.filter((rule) => rule.stage === stage)]),
  );
  return { rules, floors: loadedFloors.map((entry) => entry.floor), byStage };
}

/**
 * **Un article du tableau** — son prix résolu, sa trace, ses paliers, sa limite.
 *
 * Le prix vient de `resolvePrice`, **la fonction qui facture**. Aucune
 * arithmétique d'affichage n'est écrite ici : un écran qui recalcule à sa façon
 * finit par annoncer autre chose que la facture, et c'est précisément ce qu'un
 * client conteste.
 */
export function itemView(
  article: { sku: string; name: string; canonicalCents: number },
  context: PricingContext,
  materials: BoardMaterials,
  loaded: { rules: readonly LoadedRule[]; floors: readonly LoadedFloor[] },
  ladders: readonly VolumeLadder[],
): PricingItemView {
  const winner = resolveScopedFloor(materials.floors, context);

  // La même fonction que la caisse, avec les preuves de la simulation :
  // quantité 1, aucune mesure d'historique. La porte reste donc FERMÉE, ce qui
  // est la lecture juste — l'écran montre le prix de vitrine, et le plancher
  // dynamique s'ouvre sur des conditions que la vitrine ne remplit pas.
  const applied =
    winner === null
      ? null
      : decideFloor(winner.policy, { quantity: context.quantity, observedVolumeRatioBp: null })
          .applied;

  const resolved = resolvePrice(article.canonicalCents, materials.rules, context, applied);

  return {
    sku: article.sku,
    name: article.name,
    canonicalCents: article.canonicalCents,
    ownFloor:
      loaded.floors.find((entry) => targetsArticle(entry.floor.scope, article.sku))?.view ?? null,
    // La grille du barème : chaque ligne est une RÉSOLUTION COMPLÈTE à la
    // quantité du palier — un prix « canonique × (1 − remise) » mentirait dès
    // qu'une promotion compose avec le palier, ou qu'un plancher le relève.
    volumeTiers: volumeTierPrices(
      article.canonicalCents,
      ladders,
      materials.rules,
      context,
      applied,
    ),
    effectiveFloor: loaded.floors.find((entry) => entry.floor.id === winner?.id)?.view ?? null,
    rules: loaded.rules
      .filter((entry) => targetsArticle(entry.rule.scope, article.sku))
      .map((entry) => entry.view),
    supersededRuleIds: supersededIn(materials.byStage, context),
    steps: resolved.steps.map((step) => ({ ...step })),
    floored: resolved.floored,
    clampedToZero: resolved.clampedToZero,
    finalCents: resolved.finalCents,
    negotiationRoom: negotiationRoom(
      resolved.finalCents,
      applied === null ? null : floorCentsFor(applied, article.canonicalCents),
    ),
    // Posée à `null` ici, remplie par la passe de mesure : la résolution d'un
    // prix ne consulte pas l'historique des ventes, et ne doit pas commencer.
    elasticity: null,
  };
}

/** La portée vise-t-elle **cet article nommément** (et pas sa famille, ni tout le catalogue) ? */
export function targetsArticle(scope: PriceScope, sku: string): boolean {
  return (scope.type === "product" || scope.type === "variant") && scope.id === sku;
}

/**
 * Les règles qui **s'appliquaient** à cet article sans gagner leur étage.
 *
 * Sans ce champ, l'écran alignerait une altération de famille et une altération
 * de produit et laisserait croire qu'elles s'enchaînent — alors que la plus
 * spécifique REMPLACE l'autre à l'intérieur d'un étage. Le lecteur additionnerait
 * deux remises dont une seule a produit un effet, sans aucun moyen de s'en
 * apercevoir : les deux nombres seraient là, et le total ne collerait pas.
 */
function supersededIn(
  byStage: ReadonlyMap<PriceStage, readonly PriceRule[]>,
  context: PricingContext,
): string[] {
  const evicted: string[] = [];
  for (const stage of PRICE_STAGES) {
    const applicable = (byStage.get(stage) ?? []).filter((rule) => applies(rule, context));
    if (applicable.length < 2) {
      continue;
    }
    const winner = winnerOf(applicable, context);
    evicted.push(...applicable.filter((rule) => rule.id !== winner?.id).map((rule) => rule.id));
  }
  return evicted;
}

/**
 * **Ce qu'un commercial peut encore lâcher** sans franchir la limite.
 *
 * Sans limite posée, il n'y a pas de marge définie : rendre `null` plutôt qu'un
 * nombre évite d'annoncer une latitude que personne n'a décidée. Un article déjà
 * relevé au plancher rend `0` — ce qui est une information, et pas la même.
 *
 * Bornée à zéro : un prix passé sous son plancher (donné par une mercuriale, que
 * le plancher relève ensuite) donnerait une marge négative, c'est-à-dire une
 * hausse déguisée en remise dans la colonne où on lit les remises.
 */
function negotiationRoom(finalCents: number, floorCents: number | null): NegotiationRoom | null {
  if (floorCents === null) {
    return null;
  }
  const room = Math.max(0, finalCents - floorCents);
  return {
    floorCents,
    maxDiscountCents: room,
    // En points de base du prix FINAL : c'est sur ce prix-là que le commercial
    // annonce « je te fais 5 % », pas sur le canonique que le client n'a jamais vu.
    maxDiscountBp: finalCents <= 0 ? 0 : Math.round((room / finalCents) * 10_000),
  };
}
