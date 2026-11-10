import type { VolumeWindow } from "./ports/sku-volume.reader.js";

/**
 * **Les deux fenêtres d'une comparaison**, et pourquoi elles ont la même durée.
 *
 * Comparer trente jours à quatre-vingt-dix ferait passer une saison pour un
 * effet. La symétrie n'est pas une élégance : c'est la seule façon d'attribuer
 * un écart à ce qu'on a changé plutôt qu'à la longueur de la mesure.
 */
export interface WindowPair {
  readonly baseline: VolumeWindow;
  readonly observed: VolumeWindow;
  readonly days: number;
  /** La fenêtre observée est-elle assez longue pour qu'un écart veuille dire quelque chose ? */
  readonly conclusive: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Le recul minimal pour conclure, en jours.
 *
 * Deux semaines pleines : moins couvrirait un nombre inégal de week-ends, et la
 * boulangerie ne vend pas la même chose un samedi qu'un mardi. En dessous,
 * l'écran annonce « trop tôt » au lieu d'un pourcentage — juger une décision sur
 * du bruit est pire que ne pas la juger.
 */
export const MIN_CONCLUSIVE_DAYS = 14;

/** La fenêtre glissante par défaut : le mois écoulé, contre le mois d'avant. */
export const ROLLING_DAYS = 30;

/**
 * Les fenêtres **de part et d'autre d'un changement de prix**.
 *
 * La durée est celle qui s'est écoulée depuis le changement — c'est ce qui rend
 * les deux côtés comparables sans avoir à choisir une période arbitraire. Elle
 * est plafonnée : au-delà d'un an, la fenêtre « avant » remonterait dans une
 * autre réalité commerciale, et l'écart mesurerait l'histoire de la maison
 * plutôt que l'effet de la règle.
 */
export function windowsAroundChange(changedAt: Date, now: Date, maxDays = 365): WindowPair | null {
  const elapsedDays = Math.floor((now.getTime() - changedAt.getTime()) / DAY_MS);
  if (elapsedDays <= 0) {
    return null; // Le changement est dans le futur, ou d'aujourd'hui : rien à observer.
  }
  const days = Math.min(elapsedDays, maxDays);
  const observedFrom = new Date(now.getTime() - days * DAY_MS);
  return {
    baseline: { from: new Date(observedFrom.getTime() - days * DAY_MS), to: observedFrom },
    observed: { from: observedFrom, to: now },
    days,
    conclusive: elapsedDays >= MIN_CONCLUSIVE_DAYS,
  };
}

/** Les fenêtres glissantes : la période écoulée, contre celle d'avant. */
export function rollingWindows(now: Date, days = ROLLING_DAYS): WindowPair {
  const observedFrom = new Date(now.getTime() - days * DAY_MS);
  return {
    baseline: { from: new Date(observedFrom.getTime() - days * DAY_MS), to: observedFrom },
    observed: { from: observedFrom, to: now },
    days,
    // Une fenêtre glissante est toujours pleine : elle ne dépend d'aucun
    // événement récent, donc elle conclut dès qu'elle a des ventes.
    conclusive: days >= MIN_CONCLUSIVE_DAYS,
  };
}
