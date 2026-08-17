import type { PriceAudience, PriceRule, PriceScope, PricingContext } from "./price-rule.js";

/**
 * **Le barème de volume, en un seul objet.**
 *
 * Jusqu'ici, « 50+ à −5 %, 100+ à −10 % » était **deux règles indépendantes**.
 * Rien n'empêchait alors d'écrire « 50+ à −10 %, 100+ à −5 % » : un barème où
 * commander plus coûte plus cher. L'incohérence n'était pas exprimable
 * règle-par-règle — chacune, prise seule, est parfaitement valide.
 *
 * Réunies en **échelle**, elles deviennent une seule décision, et l'agrégat peut
 * refuser ce qu'aucune règle isolée ne pouvait voir : des paliers qui se
 * contredisent, deux unités mélangées, une hausse déguisée en remise de volume.
 *
 * C'est aussi ce qui rend l'affichage possible : un barème se montre **en
 * entier**, palier par palier, avec celui qui s'applique aujourd'hui marqué.
 * Cinq règles éparpillées ne se montrent pas, elles se cherchent.
 */

/** Un palier : à partir de cette quantité, cette remise. */
export interface VolumeTier {
  /** Quantité **minimale** sur la commande. Strictement positive. */
  readonly minQuantity: number;
  /** La remise, en points de base (`500` = −5 %) ou en centimes selon l'unité. */
  readonly value: number;
}

/**
 * L'unité de **toute** l'échelle.
 *
 * Un seul champ pour tous les paliers, et c'est ce qui rend le mélange
 * impossible plutôt que refusé : « 50+ à −5 %, 100+ à −0,20 € » ne se lit pas —
 * sans connaître l'article, on ne peut pas dire si le second palier est meilleur
 * que le premier, donc pas vérifier que le barème progresse.
 */
export type VolumeLadderUnit = "percent" | "amount";

/**
 * Une échelle posée sur une portée, une audience et une **fenêtre**.
 *
 * Datée comme une règle, pour la raison évidente : on prépare le barème de
 * septembre au mois d'août, sans toucher à celui qui tourne.
 *
 * Mais **deux barèmes ne se recouvrent jamais sur la même cible** — ce serait
 * l'ambiguïté que la frise des chevauchements sert à rendre visible, et sur un
 * barème elle serait invisible au client comme au staff. La garantie est en base
 * (contrainte d'exclusion GiST), donc elle tient même contre deux écritures
 * concurrentes ; l'agrégat ne peut pas la porter seul, ne voyant qu'une échelle
 * à la fois.
 */
export interface VolumeLadder {
  readonly id: string;
  readonly scope: PriceScope;
  readonly audience: PriceAudience;
  readonly unit: VolumeLadderUnit;
  /** Triés par quantité **croissante**, et l'agrégat le garantit. */
  readonly tiers: readonly VolumeTier[];
  /** Ce que la trace affichera au client et au service client. */
  readonly label: string;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**. `null` = ouverte. */
  readonly validTo: Date | null;
  /** L'instant où l'échelle a cessé d'agir. `null` = elle agit. */
  readonly suspendedFrom: Date | null;
}

/**
 * **Le palier qui s'applique à cette quantité**, ou `null` en dessous du premier.
 *
 * Le plus haut palier atteint gagne — c'est ce qui fait qu'une commande de 150
 * prend le palier 100 et non le palier 50. Les paliers étant triés croissants,
 * le dernier qui passe est le bon.
 */
export function tierFor(ladder: VolumeLadder, quantity: number): VolumeTier | null {
  let winner: VolumeTier | null = null;
  for (const tier of ladder.tiers) {
    if (quantity >= tier.minQuantity) {
      winner = tier;
    }
  }
  return winner;
}

/**
 * **L'échelle, vue comme la règle de l'étage volume** qu'elle est ce jour-là.
 *
 * C'est la pièce qui évite de toucher au pipeline : la résolution continue de ne
 * connaître que des `PriceRule`, la spécificité continue d'arbitrer entre elles,
 * et la trace figée sur la ligne de commande porte l'identifiant de l'échelle
 * comme elle portait celui d'une règle. Un étage « barème » à part aurait
 * dupliqué l'arbitrage de portée et d'audience, pour le même résultat.
 *
 * `null` quand la quantité n'atteint aucun palier : l'étage volume est alors
 * transparent, exactement comme lorsqu'aucune règle ne s'applique.
 */
export function ladderAsRule(ladder: VolumeLadder, context: PricingContext): PriceRule | null {
  const tier = tierFor(ladder, context.quantity);
  return tier === null ? null : ladderAtTier(ladder, tier);
}

/**
 * **L'échelle vue à un palier donné**, sans passer par une quantité.
 *
 * Extrait de {@link ladderAsRule} pour la **frise** des recouvrements : elle ne
 * résout aucune commande, donc elle n'a pas de quantité à présenter — mais elle
 * doit dire ce que le barème compose avec une promotion, et cela dépend du
 * palier. Elle demande donc les deux bouts de l'échelle plutôt que d'en inventer
 * un.
 */
export function ladderAtTier(ladder: VolumeLadder, tier: VolumeTier): PriceRule {
  return {
    id: ladder.id,
    stage: "volume",
    scope: ladder.scope,
    audience: ladder.audience,
    minQuantity: tier.minQuantity,
    validFrom: ladder.validFrom,
    validTo: ladder.validTo,
    suspendedFrom: ladder.suspendedFrom,
    label: ladder.label,
    nature: "alter",
    alteration:
      ladder.unit === "percent"
        ? { direction: "decrease", mode: "percent", bp: tier.value }
        : { direction: "decrease", mode: "amount", cents: tier.value },
  };
}
