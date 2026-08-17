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
 * Une échelle posée sur une portée et une audience.
 *
 * **Pas de fenêtre**, à la différence d'une règle : un barème de volume est une
 * grille debout, pas une opération datée. Deux barèmes datés qui se recouvrent
 * poseraient exactement l'ambiguïté que la frise des chevauchements sert à
 * rendre visible — et sur un barème, elle serait invisible au client comme au
 * staff. On l'édite (ce qui est une nouvelle décision, journalisée) ou on
 * l'archive.
 *
 * Ce que ça coûte, et c'est assumé : on ne programme pas le barème de
 * septembre au mois d'août. Le jour où ce manque se fait sentir, il se comblera
 * par une échelle **datée**, sans rien défaire ici.
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
  if (tier === null) {
    return null;
  }
  return {
    id: ladder.id,
    stage: "volume",
    scope: ladder.scope,
    audience: ladder.audience,
    minQuantity: tier.minQuantity,
    // Une échelle n'a pas de fenêtre : elle vaut tant qu'elle n'est pas
    // suspendue. Une borne basse dans un passé lointain dit exactement ça au
    // reste du pipeline, sans lui apprendre un cas de plus.
    validFrom: new Date(0),
    validTo: null,
    suspendedFrom: ladder.suspendedFrom,
    label: ladder.label,
    nature: "alter",
    alteration:
      ladder.unit === "percent"
        ? { direction: "decrease", mode: "percent", bp: tier.value }
        : { direction: "decrease", mode: "amount", cents: tier.value },
  };
}
