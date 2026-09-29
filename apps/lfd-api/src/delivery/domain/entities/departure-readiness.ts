/**
 * Où en est le chargement d'un arrêt (plan de tournée, lot 4, L4-C17) :
 *
 * - `unlabelled` — aucun bac non annulé. 🔴 « Tous ses bacs chargés » serait
 *   VRAI sur un ensemble vide : une commande jamais étiquetée passerait. Zéro
 *   bac n'est donc pas « chargé » ;
 * - `partial` — des bacs restent à charger ;
 * - `loaded` — tous ses bacs non annulés sont chargés.
 */
export type StopLoadingState = "unlabelled" | "partial" | "loaded";

/** Ce que « Partir » sait d'un arrêt : de quoi refuser en le nommant. */
export interface StopReadiness {
  readonly stopId: string;
  readonly reference: string;
  readonly state: StopLoadingState;
  /** Les codes de ses bacs partagés « à refaire » (v2-4) — vide le plus souvent. */
  readonly binsToRedo: readonly string[];
}

/**
 * L'état d'un arrêt, d'après ses bacs non annulés et ceux qui y sont chargés.
 * La SEULE définition : l'écran de chargement et « Partir » la lisent tous deux.
 */
export function loadingStateOf(
  liveBinIds: readonly string[],
  loadedBinIds: ReadonlySet<string>,
): StopLoadingState {
  if (liveBinIds.length === 0) {
    return "unlabelled";
  }
  return liveBinIds.every((binId) => loadedBinIds.has(binId)) ? "loaded" : "partial";
}

/** Un bac partagé à refaire, nommé pour le refus : son code, et la commande de l'arrêt. */
export interface BinToRedo {
  readonly code: string;
  readonly reference: string;
}

/**
 * Les bacs partagés à refaire des arrêts vivants (v2-4) — « Partir » refuse
 * l'arrêt qui en porte un.
 */
export function sharedBinsToRedo(
  liveStops: readonly { readonly id: string }[],
  readiness: readonly StopReadiness[],
): readonly BinToRedo[] {
  const live = new Set(liveStops.map((stop) => stop.id));
  return readiness
    .filter((stop) => live.has(stop.stopId))
    .flatMap((stop) => stop.binsToRedo.map((code) => ({ code, reference: stop.reference })));
}

/**
 * Les références des arrêts vivants qui empêchent de partir, rangées par
 * cause. Un arrêt que `readiness` ne cite pas est tenu pour non étiqueté —
 * jamais pour chargé : l'absence d'information ne fait pas partir un bac.
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
