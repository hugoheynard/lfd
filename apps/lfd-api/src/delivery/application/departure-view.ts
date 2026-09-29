import type { DepartureView, DeparturePointView } from "@lfd/contracts";

import type { DepartureCandidate } from "../channels/commerce/index.js";

/**
 * **D'où partent les tournées**, déduit du choix enregistré et des points de
 * retrait tels que le commerce les sert aujourd'hui.
 *
 * - un choix qui désigne un point existant → `explicit` ;
 * - aucun choix → `default`, le point par défaut du commerce ;
 * - 🔴 **un choix dont le point a disparu** (supprimé côté commerce, qui efface
 *   ses points physiquement) → `default` aussi, et c'est délibéré (bâti du
 *   lot 2, 2026-09-29). Rendre l'ancien identifiant obligerait l'écran à
 *   afficher une adresse qu'on ne connaît plus ; en inventer une serait pire.
 *   Le départ retombe sur ce qui existe, l'écran dit « par défaut », et le
 *   geste de sortie est de choisir à nouveau. La ligne enregistrée n'est pas
 *   effacée : une lecture n'écrit rien (`CLAUDE.md` §4) ;
 * - aucun point de retrait → `default` et `point: null` : l'écran le dit.
 */
export function departureViewOf(
  chosenId: string | null,
  candidates: readonly DepartureCandidate[],
): DepartureView {
  const choices = candidates.map(pointOf);
  const chosen = candidates.find((candidate) => candidate.pickupAddressId === chosenId);
  if (chosen !== undefined) {
    return { source: "explicit", point: pointOf(chosen), choices };
  }
  const fallback = candidates.find((candidate) => candidate.isDefault) ?? candidates[0];
  return { source: "default", point: fallback === undefined ? null : pointOf(fallback), choices };
}

function pointOf(candidate: DepartureCandidate): DeparturePointView {
  return {
    pickupAddressId: candidate.pickupAddressId,
    label: candidate.label,
    address: candidate.address,
    gps: candidate.gps,
  };
}
