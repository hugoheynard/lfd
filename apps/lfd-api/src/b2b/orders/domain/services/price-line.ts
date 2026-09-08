import type { CommitmentDecisionView, VolumeTierPriceView } from "@lfd/contracts";
import {
  pricingContextFor,
  type PricingParties,
} from "../../../pricing/application/pricing-context.js";
import { decideFloor } from "../../../pricing/domain/floor-policy.js";
import {
  floorsFor,
  laddersFor,
  mercurialeFor,
  rulesFor,
  type PricingEvidence,
  type PricingMaterials,
} from "../../../pricing/domain/pricing-materials.js";
import type { PriceRule } from "../../../pricing/domain/price-rule.js";
import { floorMillicentsFor, resolveScopedFloor } from "../../../pricing/domain/resolve-floor.js";
import { resolvePrice } from "../../../pricing/domain/resolve-price.js";
import { volumeTierPrices } from "../../../pricing/application/volume-tier-prices.js";
import { commitmentFor, retainedQuantity } from "../../../pricing/domain/volume-commitment.js";
import { ladderAsRule } from "../../../pricing/domain/volume-ladder.js";
import type { OrderLineAllergens } from "@lfd/contracts";

import type { OrderLineInput } from "../value-objects/order-line.js";

/** L'article à tarifer, réduit à ce que la résolution lit. */
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
  readonly parties: PricingParties;
  /** L'instant de résolution — le même pour tout le panier, par décision. */
  readonly at: Date;
  /** La grille des paliers : pour un devis, jamais pour une vente. */
  readonly withTiers: boolean;
}

/**
 * **Le prix d'une ligne — et la fonction est PURE.**
 *
 * ## Ce qu'elle répare
 *
 * `resolvePrice` était pure, mais trop petite. Les décisions qui comptent —
 * quel engagement couvre l'article, quelle mesure est retenue, quel plancher le
 * vise, quel étage s'ouvre, comment un barème devient une règle — vivaient dans
 * quatre-vingt-dix lignes `async` d'un orchestrateur. Six étapes pures sur huit,
 * prisonnières des deux autres : la recette n'existait qu'à cet endroit, et ne
 * s'éprouvait qu'avec sept doublés.
 *
 * Elle est ici, et elle ne lit rien. Ce qu'elle sait de la base lui est **donné**
 * : les matériaux, chargés une fois pour le panier, et les preuves, mesurées en
 * amont par lot. On l'éprouve donc en énumérant des cas, pas en fabriquant un
 * environnement — ce qui était déjà le motif de `resolvePrice`, et qui vaut
 * maintenant pour la recette entière.
 *
 * ## Ce qui n'a PAS changé
 *
 * L'ordre des décisions, à la ligne près. Ce lot ne change aucun prix : c'est sa
 * promesse, et c'est ce que les suites existantes vérifient — elles n'ont pas
 * été retouchées.
 *
 * @throws {AmbiguousPriceRulesError} deux règles également spécifiques.
 * @throws {AmbiguousPriceFloorsError} deux planchers également spécifiques.
 */
export function priceLine(
  input: LinePricingInput,
  materials: PricingMaterials,
  evidence: PricingEvidence,
): ResolvedOrderLine {
  const { item, quantity, parties, at, withTiers } = input;
  const decision = commitmentDecisionOf(input, materials, evidence);
  const context = pricingContextFor(
    item.sku,
    item.category,
    quantity,
    parties,
    at,
    // La mesure RETENUE, pas le cumul : sous engagement, c'est le volume
    // annoncé qui ouvre le palier dès la première commande.
    decision?.retainedQuantity ?? null,
  );

  const rules = rulesFor(materials, context);
  const ladders = laddersFor(materials, context);
  // La mercuriale du client, vue comme la règle de son étage à CETTE mesure.
  // Dérivée ici et pas au chargement : le lecteur ne connaît pas la quantité.
  const mercuriale = mercurialeFor(materials, context);

  // Le barème de volume rejoint les règles sous la forme de la règle d'étage
  // volume qu'il est à CETTE quantité. La spécificité arbitre ensuite comme
  // d'habitude — un barème de produit l'emporte sur celui de sa famille, sans
  // que la résolution apprenne un cas de plus.
  const volumeRules = ladders
    .map((ladder) => ladderAsRule(ladder, context))
    .filter((rule): rule is PriceRule => rule !== null);

  // Quel plancher VISE cet article, puis lequel de ses étages s'ouvre : deux
  // questions distinctes, la seconde dépendant de la commande et de l'historique.
  const scoped = resolveScopedFloor(floorsFor(materials, context), context);
  // La mesure n'a été prise que si un plancher la réclamait : absente du relevé,
  // elle vaut `null`, ce qui est exactement ce que la lecture paresseuse rendait.
  const observedVolumeRatioBp =
    scoped === null ? null : (evidence.volumeRatioBySku.get(item.sku) ?? null);
  const floorDecision =
    scoped === null ? null : decideFloor(scoped.policy, { quantity, observedVolumeRatioBp });
  const applied = floorDecision?.applied ?? null;
  const resolved = resolvePrice(
    item.unitPriceMillicents,
    mercuriale === null ? [...rules, ...volumeRules] : [...rules, ...volumeRules, mercuriale],
    context,
    applied,
  );

  return {
    line: {
      sku: item.sku,
      productName: item.name,
      unitPriceMillicents: resolved.finalMillicents,
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
        basePriceMillicents: resolved.basePriceMillicents,
        steps: resolved.steps,
        floored: resolved.floored,
        // La décision de plancher est figée AVEC le prix. C'est ce qui rend le
        // plancher dynamique tenable : sans la mesure consignée, un prix qui
        // dépend de l'historique cesse d'être explicable dès que l'historique
        // bouge. Elle ne se relit jamais.
        floorDecision:
          floorDecision === null
            ? null
            : {
                tier: floorDecision.tier,
                floorMillicents: floorMillicentsFor(
                  floorDecision.applied,
                  item.unitPriceMillicents,
                ),
                observedVolumeRatioBp: floorDecision.unlock?.observedVolumeRatioBp ?? null,
                quantityMet: floorDecision.unlock?.quantityMet ?? true,
                volumeMet: floorDecision.unlock?.volumeMet ?? true,
              },
        // La MESURE figée avec le prix, exactement comme la décision de
        // plancher : sans elle, « pourquoi ce palier-là ? » n'a plus de réponse
        // dès que le client passe la commande suivante.
        commitment: decision,
      },
    },
    canonicalMillicents: item.unitPriceMillicents,
    sealedByRuleId: resolved.sealedByRuleId,
    sealedRuleIds: resolved.sealedRuleIds,
    // `rules` SANS `volumeRules` : `volumeTierPrices` réinjecte lui-même le
    // barème à la quantité de chaque palier. Lui passer la chaîne complète
    // dupliquait l'échelle, et deux règles de même identifiant à l'étage volume
    // rendaient la résolution ambiguë — 400 sur une commande de 20.
    volumeTiers: withTiers
      ? volumeTierPrices(
          item.unitPriceMillicents,
          ladders,
          rules,
          context,
          scoped === null ? null : { policy: scoped.policy, observedVolumeRatioBp },
          // L'OBJET, pas la règle dérivée : la grille reconvertit à chaque
          // palier qu'elle sonde. Même raison que pour les barèmes, deux lignes
          // plus haut.
          materials.mercuriale,
        )
      : null,
    floorMillicents:
      applied === null ? null : floorMillicentsFor(applied, item.unitPriceMillicents),
  };
}

/**
 * **Où en est le client sur son engagement**, cette commande comprise.
 *
 * `null` — et aucune mesure — quand aucun engagement ne couvre l'article. C'est
 * le cas de l'immense majorité des lignes.
 *
 * Le cumul **inclut la commande en cours**. Sans cela, la première commande
 * d'une période partirait toujours d'un cumul nul et le palier arriverait avec
 * une commande de retard — un client qui commande ses 6 000 pièces en une fois
 * paierait le tarif d'entrée sur la totalité.
 *
 * Les trois nombres sont consignés, et pas seulement celui qui décide : une
 * ligne facturée au palier de 10 000 alors que 1 200 ont été livrés n'est
 * relisible que si la trace dit que c'est la PROMESSE qui a ouvert ce palier.
 */
function commitmentDecisionOf(
  input: LinePricingInput,
  materials: PricingMaterials,
  evidence: PricingEvidence,
): CommitmentDecisionView | null {
  const { item, quantity, at } = input;
  const commitment = commitmentFor(
    materials.commitments,
    { categoryId: item.category, productSku: item.sku, variantSku: item.sku },
    at,
  );
  if (commitment === null) {
    return null;
  }
  const cumulativeQuantity = (evidence.orderedBySku.get(item.sku) ?? 0) + quantity;
  return {
    commitmentId: commitment.id,
    promisedQuantity: commitment.promisedQuantity,
    cumulativeQuantity,
    retainedQuantity: retainedQuantity(commitment, cumulativeQuantity),
  };
}
