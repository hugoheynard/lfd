import type { PriceFloor } from "./price-rule.js";

/**
 * **Le plancher à deux étages** — cf.
 * `documentation/b2b/architecture-resolution-de-prix.md`.
 *
 * Un plancher unique force à choisir entre protéger et laisser négocier. Il en
 * faut donc deux : un **mur** qu'on ne franchit jamais, et une **porte** plus
 * basse que le volume déverrouille.
 */
export interface FloorUnlock {
  /** Quantité minimale **sur la commande**. `null` = pas de condition. */
  readonly minQuantity: number | null;
  /**
   * Ratio de volume **observé** requis, en points de base (`12500` = ×1,25).
   * `null` = pas de condition.
   */
  readonly minVolumeRatioBp: number | null;
}

export interface DynamicFloor {
  readonly floor: PriceFloor;
  readonly unlock: FloorUnlock;
}

export interface PriceFloorPolicy {
  /** Le mur. Jamais franchi, quoi qu'il arrive. */
  readonly hard: PriceFloor;
  /** La porte, ou `null` s'il n'y en a pas. */
  readonly dynamic: DynamicFloor | null;
}

/** Ce qu'on sait au moment de décider : la commande, et l'historique. */
export interface UnlockEvidence {
  /** La quantité de CE SKU dans CETTE commande, lignes déjà fusionnées. */
  readonly quantity: number;
  /**
   * Le ratio du volume observé sur son volume de référence, en points de base.
   * `null` = pas de référence (article neuf, aucun historique).
   */
  readonly observedVolumeRatioBp: number | null;
}

/** Quel étage a mordu, et pourquoi — ce que la trace fige avec le prix. */
export interface FloorDecision {
  readonly applied: PriceFloor;
  readonly tier: "hard" | "dynamic";
  /** `null` quand aucun plancher dynamique n'est défini : rien à évaluer. */
  readonly unlock: {
    readonly quantityMet: boolean;
    readonly volumeMet: boolean;
    /** Ce qui a été mesuré, figé — l'historique bougera, pas ce nombre. */
    readonly observedVolumeRatioBp: number | null;
  } | null;
}

/**
 * **Quel plancher s'applique**, et sur quelles preuves.
 *
 * Les deux conditions doivent être remplies pour ouvrir la porte — « la plus
 * stricte gagne ». Une condition `null` est réputée remplie ; les deux `null`
 * feraient du plancher dynamique un plancher tout court, ce que la saisie
 * refuse.
 *
 * **Faute de mesure, on protège.** Sans volume de référence, la condition de
 * volume est *non remplie* et le mur s'applique. Le défaut penche du côté de la
 * maison : un déverrouillage par ignorance serait une remise accordée par un
 * trou dans les données, et personne ne la verrait passer.
 *
 * La décision rend ce qu'elle a mesuré, et l'appelant le **fige avec le prix**.
 * C'est ce qui rend le plancher dynamique tenable : faire dépendre un prix de
 * l'historique le rendrait inexplicable dès que l'historique bouge — sauf si la
 * mesure est consignée au moment où elle a compté.
 */
export function decideFloor(policy: PriceFloorPolicy, evidence: UnlockEvidence): FloorDecision {
  const dynamic = policy.dynamic;
  if (dynamic === null) {
    return { applied: policy.hard, tier: "hard", unlock: null };
  }

  const quantityMet =
    dynamic.unlock.minQuantity === null || evidence.quantity >= dynamic.unlock.minQuantity;
  const volumeMet =
    dynamic.unlock.minVolumeRatioBp === null ||
    (evidence.observedVolumeRatioBp !== null &&
      evidence.observedVolumeRatioBp >= dynamic.unlock.minVolumeRatioBp);

  const unlocked = quantityMet && volumeMet;
  return {
    applied: unlocked ? dynamic.floor : policy.hard,
    tier: unlocked ? "dynamic" : "hard",
    unlock: {
      quantityMet,
      volumeMet,
      observedVolumeRatioBp: evidence.observedVolumeRatioBp,
    },
  };
}
