import type { DeliveryIncidentView } from "@lfd/contracts";

import type { RoundsDayComposition } from "./rounds-day-composition.js";

/** Le nom de l'écran Tournées dans l'objet des journées. */
export const ROUNDS_SCREEN = "rounds";

/** Ce que l'objet des journées range pour une journée de tournées. */
export interface RoundsDayContent {
  readonly composition: RoundsDayComposition;
  readonly incidents: readonly DeliveryIncidentView[];
}

/**
 * Une journée de tournées se range toujours : aucune des lectures qu'elle
 * fixe n'a de repli dégradé (vérifié le 2026-11-13 — tournées, attendues,
 * commandes composées, signalements remontent une panne en erreur). Un
 * repli ajouté un jour se signale par un champ du contenu, et rend ce
 * prédicat faux pour lui.
 */
export function isStorableRoundsDay(_content: RoundsDayContent): boolean {
  return true;
}

/**
 * Reconnaît une charge relue de l'objet. Contrôle de FORME seulement : la
 * révision du code est dans la clé, la charge a donc été rangée par ce même
 * code ; une forme inattendue est relue en base.
 */
export function isRoundsDayContent(raw: unknown): raw is RoundsDayContent {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const composition: unknown = Reflect.get(raw, "composition");
  return (
    Array.isArray(Reflect.get(raw, "incidents")) &&
    typeof composition === "object" &&
    composition !== null &&
    typeof Reflect.get(composition, "day") === "string" &&
    Array.isArray(Reflect.get(composition, "rounds")) &&
    Array.isArray(Reflect.get(composition, "ofDay"))
  );
}
