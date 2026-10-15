import type { DepartureView, DeparturePointView } from "@lfd/contracts";

import type { DepartureCandidate } from "../channels/commerce/index.js";

/**
 * **D'où partent les tournées** — un réglage de la livraison (Réglages ›
 * Livraison › Départ), déduit du choix enregistré et des sites candidats (les
 * sites actifs qui livrent) tels que le commerce les sert aujourd'hui.
 *
 * - un choix qui désigne un candidat → `explicit` ;
 * - aucun choix, ou 🔴 **un choix dont le site a disparu** (archivé, ou qui
 *   ne livre plus) → `default`, et le départ n'est DÉDUIT que s'il n'y a
 *   qu'un candidat : il n'y a plus de « site par défaut » pour départager
 *   (Hugo, 2026-10-15). Plusieurs candidats → `point: null`, l'écran demande
 *   de choisir, et le calcul des tournées refuse en le disant
 *   (`DepartureNotLocatedError`). La ligne enregistrée n'est pas effacée :
 *   une lecture n'écrit rien (`CLAUDE.md` §4) ;
 * - aucun candidat → `default` et `point: null` : l'écran le dit.
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
  const [only, ...others] = candidates;
  const deduced = only !== undefined && others.length === 0 ? pointOf(only) : null;
  return { source: "default", point: deduced, choices };
}

function pointOf(candidate: DepartureCandidate): DeparturePointView {
  return {
    pickupAddressId: candidate.pickupAddressId,
    label: candidate.label,
    address: candidate.address,
    gps: candidate.gps,
  };
}
