import type { VolumeTierPriceView } from "@lfd/contracts";
import type { OrderLineAllergens } from "@lfd/contracts";

import type { LoadedPricer, PricedArticle } from "../../../pricing/domain/loaded-pricer.js";

import type { OrderLineInput } from "../value-objects/order-line.js";

/** L'article à tarifer, réduit à ce que la ligne de commande porte. */
export interface LineToPrice {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly category: string;
  /**
   * Ce que le référentiel déclare. `null` = il n'en porte pas — une absence,
   * jamais « aucun allergène », et jamais `undefined` : l'appelant doit poser
   * la réponse plutôt que de l'omettre.
   */
  readonly allergens: OrderLineAllergens | null;
}

/** Une ligne résolue : ce qui part sur la commande, et ce qui explique son prix. */
export interface ResolvedOrderLine {
  readonly line: OrderLineInput;
  /** Le tarif de liste d'entrée, avant le moindre étage. */
  readonly canonicalMillicents: number;
  /** La mercuriale qui a scellé la chaîne pour cette ligne, ou `null`. */
  readonly sealedByRuleId: string | null;
  /** Les règles écartées par ce scellement. */
  readonly sealedRuleIds: readonly string[];
  /**
   * **Le prix et sa trace, sous la forme du DOMAINE.**
   *
   * La même information se trouve dans `line.pricing`, mais sous la forme du
   * **contrat** : là, `pricing` est optionnel et la portée d'une étape peut
   * valoir `null`, parce que ce type décrit une ligne de commande qui a pu être
   * écrite avant que la trace n'existe. Un lecteur qui veut la trace d'un prix
   * qu'on vient de résoudre n'a pas à traverser cette optionalité-là : elle
   * appartient aux commandes anciennes, pas à ce calcul.
   */
  readonly priced: PricedArticle;
  /**
   * Le barème qui vise l'article, résolu **palier par palier**.
   *
   * `null` sur le chemin qui FACTURE : la grille n'y sert à rien, elle coûte
   * une résolution complète par palier, et un incident dedans ferait tomber une
   * vente pour un tableau que personne ne regarde.
   */
  readonly volumeTiers: readonly VolumeTierPriceView[] | null;
  /** Le plancher qui vise l'article, en millicentimes, ou `null`. */
  readonly floorMillicents: number | null;
}

/** Ce qu'il faut savoir de l'appel pour tarifer une ligne. */
export interface LinePricingInput {
  readonly item: LineToPrice;
  /** La quantité, **lignes déjà fusionnées par SKU**. */
  readonly quantity: number;
  /** La grille des paliers : pour un devis, jamais pour une vente. */
  readonly withTiers: boolean;
}

/**
 * **La ligne de commande, à partir d'un prix déjà résolu.**
 *
 * ## Ce que cette fonction ne fait plus
 *
 * Elle composait le prix : contexte, engagement, mesure retenue, plancher,
 * porte dynamique, assemblage des étages — huit gestes dans un ordre qui
 * compte. C'était la **deuxième** des cinq recettes du dépôt, et deux des cinq
 * s'étaient trompées d'un étage.
 *
 * Ces gestes vivent désormais dans le tarificateur, une fois. Ce qui reste ici
 * est du **façonnage** : mettre un prix, une TVA, des allergènes et une trace
 * dans la forme qu'une commande porte. Aucune arithmétique.
 *
 * ## Ce qui n'a pas changé
 *
 * Le prix. À la ligne près : c'est la promesse de ce lot, et ce que les suites
 * existantes vérifient — elles n'ont pas été retouchées.
 *
 * @throws {AmbiguousPriceRulesError} deux règles également spécifiques.
 * @throws {AmbiguousPriceFloorsError} deux planchers également spécifiques.
 */
export function priceLine(input: LinePricingInput, pricer: LoadedPricer): ResolvedOrderLine {
  const { item, quantity, withTiers } = input;
  const priced = pricer.price(articleOf(item), quantity);

  return {
    line: {
      sku: item.sku,
      productName: item.name,
      unitPriceMillicents: priced.finalMillicents,
      vatRate: item.vatRate,
      quantity,
      // Figés avec le prix, et pour une raison du même ordre : dans six mois,
      // la déclaration aura pu être corrigée, et plus rien ne dirait sous
      // laquelle cette commande a été passée. La différence est que le prix se
      // conteste, tandis qu'un allergène se réclame.
      allergens: item.allergens,
      // La trace part avec le prix, et pour la même raison : dans six mois, les
      // règles qui l'ont produit peuvent avoir été retirées. Sans elle, la seule
      // réponse à « pourquoi ce prix ? » serait « c'était le prix ».
      pricing: {
        basePriceMillicents: priced.canonicalMillicents,
        steps: priced.steps,
        floored: priced.floored,
        // La décision de plancher est figée AVEC le prix. C'est ce qui rend le
        // plancher dynamique tenable : sans la mesure consignée, un prix qui
        // dépend de l'historique cesse d'être explicable dès que l'historique
        // bouge. Elle ne se relit jamais.
        floorDecision: priced.floorDecision,
        // La MESURE figée avec le prix, exactement comme la décision de
        // plancher : sans elle, « pourquoi ce palier-là ? » n'a plus de réponse
        // dès que le client passe la commande suivante.
        commitment: priced.commitment,
      },
    },
    canonicalMillicents: item.unitPriceMillicents,
    sealedByRuleId: priced.sealedByRuleId,
    sealedRuleIds: priced.sealedRuleIds,
    priced,
    volumeTiers: withTiers ? pricer.tiers(articleOf(item), quantity) : null,
    floorMillicents: priced.floorMillicents,
  };
}

/** L'article de commande, réduit à ce que le tarificateur lit. */
function articleOf(item: LineToPrice) {
  return {
    sku: item.sku,
    name: item.name,
    category: item.category,
    canonicalMillicents: item.unitPriceMillicents,
  };
}
