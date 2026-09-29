/**
 * Où en est le chargement d'un arrêt (plan de tournée, lot 4, L4-C17) :
 *
 * - `unlabelled` — aucun sac non annulé. 🔴 « Tous ses sacs chargés » serait
 *   VRAI sur un ensemble vide : une commande jamais étiquetée passerait. Zéro
 *   sac n'est donc pas « chargé » ;
 * - `partial` — des sacs restent à charger ;
 * - `loaded` — tous ses sacs non annulés sont chargés.
 */
export type StopLoadingState = "unlabelled" | "partial" | "loaded";

/** Ce que « Partir » sait d'un arrêt : de quoi refuser en le nommant. */
export interface StopReadiness {
  readonly stopId: string;
  readonly reference: string;
  readonly state: StopLoadingState;
}

/**
 * L'état d'un arrêt, d'après ses sacs non annulés et ceux qui y sont chargés.
 * La SEULE définition : l'écran de chargement et « Partir » la lisent tous deux.
 */
export function loadingStateOf(
  liveBagIds: readonly string[],
  loadedBagIds: ReadonlySet<string>,
): StopLoadingState {
  if (liveBagIds.length === 0) {
    return "unlabelled";
  }
  return liveBagIds.every((bagId) => loadedBagIds.has(bagId)) ? "loaded" : "partial";
}

/**
 * Les références des arrêts vivants qui empêchent de partir, rangées par
 * cause. Un arrêt que `readiness` ne cite pas est tenu pour non étiqueté —
 * jamais pour chargé : l'absence d'information ne fait pas partir un sac.
 */
export function unreadyStops(
  liveStops: readonly { readonly id: string; readonly orderId: string }[],
  readiness: readonly StopReadiness[],
): { readonly unlabelled: readonly string[]; readonly partial: readonly string[] } {
  const byStop = new Map(readiness.map((stop) => [stop.stopId, stop]));
  const unlabelled: string[] = [];
  const partial: string[] = [];
  for (const stop of liveStops) {
    const found = byStop.get(stop.id);
    const reference = found?.reference ?? stop.orderId;
    const state = found?.state ?? "unlabelled";
    if (state === "unlabelled") {
      unlabelled.push(reference);
    } else if (state === "partial") {
      partial.push(reference);
    }
  }
  return { unlabelled, partial };
}
