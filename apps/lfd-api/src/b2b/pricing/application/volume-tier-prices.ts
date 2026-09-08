import { discountBp } from "@lfd/money";
import { decideFloor, type PriceFloorPolicy } from "../domain/floor-policy.js";
import { resolvePrice } from "../domain/resolve-price.js";
import { ladderAsRule, tierFor } from "../domain/volume-ladder.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { applies, winnerOf } from "../domain/specificity.js";
import type { PriceRule, PricingContext } from "../domain/price-rule.js";
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
 *
 * ## 🔴 TOUS les seuils, pas seulement ceux d'un barème
 *
 * La grille n'énumérait que les paliers du `VolumeLadder` gagnant, et rendait
 * `null` quand aucun ne visait l'article. Elle taisait donc la moitié des
 * grilles qui existent : une **mercuriale à paliers** n'est pas un barème, c'est
 * **une règle par palier** (`template-to-rules.ts`), avec des `minQuantity`
 * différents. Un commercial qui demandait « à combien je lui fais les 100 ? »
 * pour un client négocié sans barème public ne voyait rien.
 *
 * Tant que la grille n'est qu'un indicatif lu au téléphone, c'est une réponse
 * incomplète. Le jour où un écran **sélectionne** dedans pour éviter un
 * aller-retour, c'est un prix faux — et pour les clients qui ont négocié.
 *
 * ## Le plancher est re-décidé à CHAQUE palier
 *
 * Il ne l'était pas : la décision prise à la quantité de la commande était
 * réutilisée telle quelle pour toute la grille. Un plancher **dynamique** dont
 * la porte s'ouvre à 50 pièces annonçait donc, sur la ligne « 100 », un prix
 * relevé par le mur dur — c'est-à-dire un prix que la commande n'aurait pas
 * appliqué.
 *
 * Le corriger ne coûte **aucune lecture** : la mesure de volume observée ne
 * dépend pas de la quantité du palier, seule la quantité change dans
 * `decideFloor`, qui est pure.
 *
 * ## 🔴 Mais la porte se rejoue sur la COMMANDE, pas sur le seuil
 *
 * Les deux mesures ne sont pas la même, et la confusion serait invisible : un
 * seuil de palier se lit sur le **cumul** dès qu'il y a engagement
 * (cf. {@link atQuantity}), tandis que la porte d'un plancher dynamique se juge
 * sur la **commande** — `UnlockEvidence.quantity` dit « la quantité de CE SKU
 * dans CETTE commande ». Passer le seuil aux deux ouvrirait la porte d'un client
 * engagé sur une quantité qu'il ne commande pas : la grille annoncerait un prix
 * sous le mur dur, que la commande ne servirait jamais.
 *
 * Sans engagement les deux coïncident et rien ne change — c'est le cas courant.
 * Sous engagement, on garde la quantité réelle de la commande : le défaut penche
 * du côté de la maison, comme dans `decideFloor` lui-même.
 */
export function volumeTierPrices(
  canonicalMillicents: number,
  ladders: readonly VolumeLadder[],
  rules: readonly PriceRule[],
  context: PricingContext,
  /**
   * Le plancher qui vise l'article et de quoi rejouer sa porte — `null` s'il n'y
   * en a pas.
   *
   * La **politique** et non sa valeur appliquée : c'est ce qui permet de
   * redécider par palier. Passer la valeur, comme avant, revenait à figer la
   * décision d'une seule quantité sur toute la grille.
   */
  floor: {
    readonly policy: PriceFloorPolicy;
    readonly observedVolumeRatioBp: number | null;
  } | null,
  /**
   * La mercuriale du client, **en objet** — jamais sa règle dérivée.
   *
   * C'est toute la raison de ce paramètre : cette grille reconvertit à CHAQUE
   * palier sondé, et une règle reçue toute faite y serait figée à la mesure du
   * panier. Une mercuriale à paliers reperdrait alors ses seuils négociés, ce
   * qui est exactement le défaut que le 🔴 du haut de ce fichier décrit.
   */
  mercuriale: CompanyMercuriale | null = null,
): readonly VolumeTierPriceView[] | null {
  const ladder = winningLadder(ladders, context);
  const thresholds = allThresholds(ladder, rules, context, mercuriale);
  if (thresholds.length === 0) {
    // Aucun seuil nulle part : le prix ne dépend pas de la quantité, et une
    // grille à une ligne dirait le contraire.
    return null;
  }

  return thresholds.map((minQuantity) => {
    const at = atQuantity(context, minQuantity);
    const applied =
      floor === null
        ? null
        : decideFloor(floor.policy, {
            quantity: orderQuantityAt(context, minQuantity),
            observedVolumeRatioBp: floor.observedVolumeRatioBp,
          }).applied;
    const resolved = resolvePrice(
      canonicalMillicents,
      withLadder(rules, ladders, mercuriale, at),
      at,
      applied,
    );
    return {
      minQuantity,
      unitPriceMillicents: resolved.finalMillicents,
      discountBp: discountBp(canonicalMillicents, resolved.finalMillicents),
    };
  });
}

/**
 * **Les quantités auxquelles le prix change**, quelle qu'en soit la cause.
 *
 * Les paliers du barème gagnant, **et** les seuils des règles qui visent
 * l'article. Une règle est retenue si elle s'applique **à son propre seuil** :
 * l'évaluer à la quantité courante l'écarterait dès que le panier est en dessous,
 * c'est-à-dire précisément quand la grille sert à répondre « et si j'en prends
 * cent ? ».
 *
 * Triés et dédupliqués : deux mécanismes peuvent poser le même seuil, et la
 * grille n'a qu'une ligne à en dire.
 */
function allThresholds(
  ladder: VolumeLadder | null,
  rules: readonly PriceRule[],
  context: PricingContext,
  mercuriale: CompanyMercuriale | null,
): number[] {
  const fromLadder = ladder === null ? [] : ladder.tiers.map((tier) => tier.minQuantity);
  const fromRules = rules.flatMap((rule) =>
    rule.minQuantity === null || !applies(rule, atQuantity(context, rule.minQuantity))
      ? []
      : [rule.minQuantity],
  );
  // Les seuils de la mercuriale se lisent sur l'OBJET, la grille n'étant plus
  // une collection de règles. Même critère que pour les règles : un seuil compte
  // s'il ouvre quelque chose **à sa propre quantité**.
  const fromMercuriale =
    mercuriale === null
      ? []
      : (mercuriale.lines.find((line) => line.sku === context.productSku)?.tiers ?? [])
          .filter((tier) => mercuriale.asRuleFor(atQuantity(context, tier.minQuantity)) !== null)
          .map((tier) => tier.minQuantity);
  return [...new Set([...fromLadder, ...fromRules, ...fromMercuriale])].sort(
    (left, right) => left - right,
  );
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

/**
 * La quantité **de commande** correspondant à un seuil de palier.
 *
 * Sans engagement, un seuil EST une quantité de commande. Sous engagement, il
 * est un cumul de saison : la commande, elle, reste celle du panier, et c'est
 * elle que la porte du plancher doit voir.
 */
function orderQuantityAt(context: PricingContext, threshold: number): number {
  return context.cumulativeQuantity === null ? threshold : context.quantity;
}

/**
 * Les règles du moment, plus le palier que les barèmes ouvrent à cette quantité,
 * plus celui de la mercuriale.
 *
 * Les trois se dérivent **à cette quantité-ci**, jamais avant : c'est ce que la
 * grille sonde, palier par palier.
 */
function withLadder(
  rules: readonly PriceRule[],
  ladders: readonly VolumeLadder[],
  mercuriale: CompanyMercuriale | null,
  context: PricingContext,
): PriceRule[] {
  const fromLadders = ladders
    .map((ladder) =>
      tierFor(ladder, context.quantity) === null ? null : ladderAsRule(ladder, context),
    )
    .filter((rule): rule is PriceRule => rule !== null);
  const fromMercuriale = mercuriale?.asRuleFor(context) ?? null;
  return fromMercuriale === null
    ? [...rules, ...fromLadders]
    : [...rules, ...fromLadders, fromMercuriale];
}
